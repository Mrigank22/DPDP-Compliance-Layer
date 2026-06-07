# services/workers/app/connectors/__init__.py
# Import all connectors so their @register_connector decorators fire.
from app.connectors.base import get_connector, BaseConnector, ConnectionTestResult
from app.connectors.postgresql_connector import PostgreSQLConnector
from app.connectors.s3_connector import S3Connector
