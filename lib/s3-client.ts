import { S3Client } from '@aws-sdk/client-s3';
import {
  getStorageConfiguration,
  type StorageConfiguration,
} from './runtimeConfig';

type StorageClients = {
  configuration: StorageConfiguration;
  service: S3Client;
  browser: S3Client;
};

let storageClients: StorageClients | null = null;

function hasSameConfiguration(
  left: StorageConfiguration,
  right: StorageConfiguration
) {
  return left.endpoint === right.endpoint
    && left.browserEndpoint === right.browserEndpoint
    && left.region === right.region
    && left.accessKeyId === right.accessKeyId
    && left.secretAccessKey === right.secretAccessKey
    && left.bucketName === right.bucketName
    && left.forcePathStyle === right.forcePathStyle;
}

function createS3Client(endpoint: string, configuration: StorageConfiguration) {
  return new S3Client({
    region: configuration.region,
    endpoint,
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
    },
    forcePathStyle: configuration.forcePathStyle,
  });
}

function getStorageClients() {
  const configuration = getStorageConfiguration();
  if (storageClients && hasSameConfiguration(storageClients.configuration, configuration)) {
    return storageClients;
  }

  storageClients?.service.destroy();
  storageClients?.browser.destroy();
  storageClients = {
    configuration,
    service: createS3Client(configuration.endpoint, configuration),
    browser: createS3Client(configuration.browserEndpoint, configuration),
  };
  return storageClients;
}

export function getS3Client() {
  return getStorageClients().service;
}

export function getBrowserS3Client() {
  return getStorageClients().browser;
}

export function getStorageBucketName() {
  return getStorageConfiguration().bucketName;
}
