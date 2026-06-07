# services/workers/app/connectors/s3_connector.py

from __future__ import annotations
import csv
import io
import json
import time
from typing import Any, Generator

import boto3
from botocore.exceptions import ClientError, NoCredentialsError

from app.connectors.base import BaseConnector, ConnectionTestResult, register_connector
from app.config import settings

_SUPPORTED_EXT = {".json", ".csv", ".txt", ".log", ".ndjson", ".jsonl"}
_MAX_OBJECT_SIZE = 5 * 1024 * 1024  # 5 MB


@register_connector("s3_bucket")
class S3Connector(BaseConnector):
    """Samples objects from an AWS S3 bucket for PII scanning."""

    def __init__(self, asset_id: str, tenant_id: str, config: dict[str, Any]):
        super().__init__(asset_id, tenant_id, config)
        self._client = None

    def _get_client(self):
        if self._client is None:
            kwargs: dict[str, Any] = {"region_name": self.config.get("region", settings.aws_region)}
            if self.config.get("access_key_id"):
                kwargs["aws_access_key_id"] = self.config["access_key_id"]
                kwargs["aws_secret_access_key"] = self.config["secret_access_key"]
            elif self.config.get("role_arn"):
                sts = boto3.client("sts")
                creds = sts.assume_role(
                    RoleArn=self.config["role_arn"],
                    RoleSessionName="DataSentinelScan",
                    DurationSeconds=3600,
                )["Credentials"]
                kwargs.update({
                    "aws_access_key_id": creds["AccessKeyId"],
                    "aws_secret_access_key": creds["SecretAccessKey"],
                    "aws_session_token": creds["SessionToken"],
                })
            self._client = boto3.client("s3", **kwargs)
        return self._client

    def test_connection(self) -> ConnectionTestResult:
        bucket = self.config.get("bucket_name")
        if not bucket:
            return ConnectionTestResult(success=False, message="bucket_name required")
        start = time.monotonic()
        try:
            self._get_client().head_bucket(Bucket=bucket)
            return ConnectionTestResult(
                success=True,
                message=f"Bucket '{bucket}' is accessible",
                latency_ms=(time.monotonic() - start) * 1000,
            )
        except ClientError as e:
            return ConnectionTestResult(success=False, message=f"S3 error: {e}")
        except NoCredentialsError:
            return ConnectionTestResult(success=False, message="AWS credentials not found")
        except Exception as e:
            return ConnectionTestResult(success=False, message=str(e))

    def list_sources(self) -> list[dict[str, Any]]:
        client = self._get_client()
        bucket = self.config["bucket_name"]
        prefix = self.config.get("prefix", "")
        paginator = client.get_paginator("list_objects_v2")
        supported = 0
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                if _get_ext(obj["Key"]) in _SUPPORTED_EXT and obj["Size"] <= _MAX_OBJECT_SIZE:
                    supported += 1
        return [{"name": prefix or "/", "type": "bucket", "estimated_rows": supported}]

    def stream_batches(
        self,
        source_name: str,
        batch_size: int = 500,
        max_records: int | None = None,
    ) -> Generator[list[dict[str, Any]], None, None]:
        client = self._get_client()
        bucket = self.config["bucket_name"]
        max_objects = min(max_records or settings.s3_max_objects_per_scan, settings.s3_max_objects_per_scan)
        paginator = client.get_paginator("list_objects_v2")
        batch: list[dict[str, Any]] = []
        processed = 0

        for page in paginator.paginate(Bucket=bucket, Prefix=source_name.lstrip("/")):
            for obj in page.get("Contents", []):
                if processed >= max_objects:
                    if batch:
                        yield batch
                    return
                key = obj["Key"]
                ext = _get_ext(key)
                if ext not in _SUPPORTED_EXT or obj["Size"] == 0 or obj["Size"] > _MAX_OBJECT_SIZE:
                    continue
                try:
                    records = self._extract(client, bucket, key, ext)
                    batch.extend(records)
                    processed += 1
                except Exception as exc:
                    self.log.warning("Failed to read s3://%s/%s: %s", bucket, key, exc)

                while len(batch) >= batch_size:
                    yield batch[:batch_size]
                    batch = batch[batch_size:]

        if batch:
            yield batch

    def _extract(self, client, bucket: str, key: str, ext: str) -> list[dict[str, Any]]:
        raw = client.get_object(Bucket=bucket, Key=key)["Body"].read()
        if ext == ".json":
            data = json.loads(raw)
            if isinstance(data, list):
                return [{"_key": key, **(_flat(r) if isinstance(r, dict) else {"v": r})} for r in data]
            if isinstance(data, dict):
                return [{"_key": key, **_flat(data)}]
            return [{"_key": key, "value": str(data)}]
        if ext in {".ndjson", ".jsonl"}:
            out = []
            for line in raw.decode("utf-8", errors="replace").splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    out.append({"_key": key, **(_flat(obj) if isinstance(obj, dict) else {"v": obj})})
                except json.JSONDecodeError:
                    out.append({"_key": key, "raw": line})
            return out
        if ext == ".csv":
            text = raw.decode("utf-8", errors="replace")
            return [{"_key": key, **dict(row)} for row in csv.DictReader(io.StringIO(text))]
        # .txt / .log
        return [{"_key": key, "line": ln} for ln in raw.decode("utf-8", errors="replace").splitlines() if ln.strip()]

    def close(self) -> None:
        self._client = None


def _get_ext(key: str) -> str:
    lower = key.lower()
    for ext in _SUPPORTED_EXT:
        if lower.endswith(ext):
            return ext
    return ""


def _flat(d: dict, prefix: str = "") -> dict:
    out = {}
    for k, v in d.items():
        nk = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(_flat(v, nk))
        elif isinstance(v, list):
            out[nk] = json.dumps(v)
        else:
            out[nk] = v
    return out
