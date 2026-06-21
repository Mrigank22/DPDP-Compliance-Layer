# services/workers/app/connectors/__init__.py
# Import all connectors so their @register_connector decorators fire.
# Cloud SDK imports inside each connector are lazy, so importing these modules
# never fails even when a provider's SDK is not installed in the image.
from app.connectors.base import get_connector, BaseConnector, ConnectionTestResult
from app.connectors.postgresql_connector import PostgreSQLConnector
from app.connectors.mysql_connector import MySQLConnector
from app.connectors.s3_connector import S3Connector
from app.connectors.gcs_connector import GCSConnector
from app.connectors.azure_blob_connector import AzureBlobConnector
