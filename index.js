// @ts-check
import * as core from '@actions/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';

const BASE_API_URL = 'https://api.addons.microsoftedge.microsoft.com';

/**
 * @typedef {object} AuthTokenResponse
 * @property {string} token_type
 * @property {number} expires_in
 * @property {string} access_token
 */

async function main() {
  // Validate the add-on asset
  const workspace = /** @type string */ (process.env.GITHUB_WORKSPACE);
  const addonFile = path.join(
    workspace,
    core.getInput('addon_file', { required: true })
  );
  if (!fs.existsSync(addonFile)) {
    throw new Error(`Asset file not found ${addonFile}`);
  }
  core.info(`Found add-on file: ${addonFile}`);

  // Validate other inputs
  const apiKey = core.getInput('api_key', { required: true });
  const clientId = core.getInput('client_id', { required: true });
  const productId = core.getInput('product_id', { required: true });

  core.info('Uploading add-on...');

  // Upload the add-on asset
  const uploadOperationId = await upload({
    apiKey,
    clientId,
    file: /** @type ReadableStream */ (
      Readable.toWeb(fs.createReadStream(addonFile))
    ),
    productId,
  });
  core.info(
    `Successfully uploaded add-on (operation ID: ${uploadOperationId})`
  );

  // Wait for the upload the be processed
  await waitForOperation({
    apiKey,
    clientId,
    operation: 'upload',
    operationId: uploadOperationId,
    productId,
  });

  core.info('Publishing new version...');

  // Publish the new version
  const publishOperationId = await publish({
    apiKey,
    clientId,
    productId,
    notes: core.getInput('notes'),
  });

  // Wait for the publish to complete
  await waitForOperation({
    apiKey,
    clientId,
    operation: 'publish',
    operationId: publishOperationId,
    productId,
  });

  core.info('Publishing complete.');
}

main().catch((error) => {
  core.setFailed(error.message);
});

/**
 * Uploads a file to Microsoft Edge Add-ons.
 *
 * @param {object} options
 * @param {string} options.apiKey
 * @param {string} options.clientId
 * @param {ReadableStream} options.file
 * @param {string} options.productId
 *
 * @returns {Promise<string>}
 */
async function upload({ apiKey, clientId, file, productId }) {
  const uploadUrl = `${BASE_API_URL}/v1/products/${productId}/submissions/draft/package`;
  core.debug(`Making POST request to ${uploadUrl}`);
  const res = await fetch(uploadUrl, {
    headers: {
      Authorization: `ApiKey ${apiKey}`,
      'X-ClientID': clientId,
      'Content-Type': 'application/zip',
    },
    // @ts-expect-error
    duplex: 'half',
    method: 'POST',
    body: file,
  });

  if (res.status !== 202) {
    throw new Error(`Got status ${res.status} when uploading add-on`);
  }

  const operationId = res.headers.get('location');
  if (!operationId) {
    throw new Error(`Failed to get operation ID from response`);
  }

  return operationId;
}

/**
 * Publishes a draft submission
 *
 * @param {object} options
 * @param {string} options.apiKey
 * @param {string} options.clientId
 * @param {string} options.productId
 * @param {string | undefined} options.notes
 *
 * @returns {Promise<string>}
 */
async function publish({ apiKey, clientId, productId, notes }) {
  /** @type RequestInit */
  let fetchOptions = {
    headers: { Authorization: `ApiKey ${apiKey}`, 'X-ClientID': clientId },
    method: 'POST',
  };

  /*
   * I have no idea what the format of the notes is supposed to be.
   *
   * The intro docs[1] give this example:
   *
   * ```
   * > curl \
   *   -H "Authorization: Bearer $TOKEN" \
   *   -X POST \
   *   -d '{ "notes"="text value" }' \
   *   -v \
   *   https://api.addons.microsoftedge.microsoft.com/v1/products/$productID/submissions
   * ```
   *
   * Which looks like some sort of JSON object.
   *
   * But the API reference[2] says:
   *
   *   Request body
   *   <Notes for certification>, in plain text format.
   *
   * Which suggests it's plain text. Who knows?
   *
   * [1] https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/using-addons-api#publishing-the-submission
   * [2] https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/addons-api-reference#publish-the-product-draft-submission
   */
  if (notes?.length) {
    /** @type Record<string, string> */ (fetchOptions.headers)['Content-Type'] =
      'text/plain';
    fetchOptions.body = notes;
  }

  const publishUrl = `${BASE_API_URL}/v1/products/${productId}/submissions`;
  core.debug(`Making POST request to ${publishUrl}`);
  const res = await fetch(publishUrl, fetchOptions);

  if (res.status !== 202) {
    throw new Error(`Got status ${res.status} when uploading add-on`);
  }

  const operationId = res.headers.get('location');
  if (!operationId) {
    throw new Error(`Failed to get operation ID from response`);
  }

  return operationId;
}

/**
 * @typedef {object} InProgressOperationStatus
 * @property {string} id
 * @property {string} createdTime
 * @property {string} lastUpdatedTime
 * @property {"InProgress"} status
 * @property {null} message
 * @property {null} errorCode
 * @property {null} errors
 */

/**
 * @typedef {object} SuccessOperationStatus
 * @property {string} id
 * @property {string} createdTime
 * @property {string} lastUpdatedTime
 * @property {"Succeeded"} status
 * @property {string} message
 * @property {""} errorCode
 * @property {null} errors
 */

/**
 * @typedef {object} FailedOperationStatus
 * @property {string} id
 * @property {string} createdTime
 * @property {string} lastUpdatedTime
 * @property {"Failed"} status
 * @property {string} message
 * @property {string} errorCode
 * @property {Array<string>} errors
 */

/**
 * @typedef {InProgressOperationStatus | SuccessOperationStatus | FailedOperationStatus} OperationStatus
 */

/**
 * Uploads a file to Microsoft Edge Add-ons.
 *
 * @param {object} options
 * @param {string} options.apiKey
 * @param {string} options.clientId
 * @param {'upload' | 'publish'} options.operation
 * @param {string} options.operationId
 * @param {string} options.productId
 */
async function waitForOperation({
  apiKey,
  clientId,
  operation,
  operationId,
  productId,
}) {
  const startTime = Date.now();
  const operationUrl =
    operation === 'upload'
      ? `${BASE_API_URL}/v1/products/${productId}/submissions/draft/package/operations/${operationId}`
      : `${BASE_API_URL}/v1/products/${productId}/submissions/operations/${operationId}`;
  core.debug(`Making GET request to ${operationUrl}`);

  let inProgress = true;
  while (inProgress) {
    core.info('Checking operation status...');
    const res = await fetch(operationUrl, {
      headers: { Authorization: `ApiKey ${apiKey}`, 'X-ClientID': clientId },
    });

    const status = /** @type OperationStatus */ await res.json();
    if (status.status === 'Failed') {
      console.log(status);
      throw new Error(
        `Operation failed: ${status.message} (code ${status.errorCode})`
      );
    }

    if (status.status === 'Succeeded') {
      core.info('Operation complete.');
      break;
    }

    // Add a hard 10 minute timeout to any operation
    if (Date.now() - startTime > 10 * 60 * 1000) {
      throw new Error('Timed out waiting for operation to complete');
    }

    // Use a 5 second polling interval
    core.info(
      'Operation is still in progress. Waiting 5 seconds before checking again.'
    );
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
