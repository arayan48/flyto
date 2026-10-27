'use strict';

// a per-user value: null follows the setting, 0 lifts the limit, anything else replaces it
function pick(own, global) {
  if (own === null || own === undefined) return global || null;
  return own || null;
}

/**
 * Limits of one user, null meaning unlimited. Admins are not limited.
 */
function limitsFor(user, settings) {
  const maxFileSize = settings.get('maxFileSize') || null;
  if (user && user.role === 'admin') {
    return { transfer: null, file: null, storage: null, transfers: null, files: null };
  }
  const transfer = pick(user && user.quotaTransfer, settings.get('maxTransferSize'));
  return {
    transfer,
    file: maxFileSize && transfer ? Math.min(maxFileSize, transfer) : (maxFileSize || transfer),
    storage: pick(user && user.quotaStorage, settings.get('userStorageQuota')),
    transfers: pick(user && user.quotaTransfers, settings.get('maxActiveTransfers')),
    files: settings.get('maxFilesPerTransfer') || null,
  };
}

/**
 * @returns {null|{code: string, message: string, limit: number}} why the new file is refused
 */
function checkUpload({ limits, size, bucketSize, bucketFiles, isNewBucket, usage }) {
  // the transfer limit first: the file limit defaults to it and would hide which one applies
  if (limits.transfer && bucketSize + size > limits.transfer) {
    return { code: 'transferTooLarge', limit: limits.transfer, message: `Bucket exceeds maximum upload size ${ limits.transfer }.` };
  }
  if (limits.file && size > limits.file) {
    return { code: 'fileTooLarge', limit: limits.file, message: `File exceeds maximum upload size ${ limits.file }.` };
  }
  if (limits.files && bucketFiles + 1 > limits.files) {
    return { code: 'tooManyFiles', limit: limits.files, message: `A transfer holds at most ${ limits.files } files.` };
  }
  if (usage && limits.storage && usage.storage + size > limits.storage) {
    return { code: 'storageQuota', limit: limits.storage, message: `Storage quota of ${ limits.storage } bytes exceeded.` };
  }
  if (usage && limits.transfers && isNewBucket && usage.transfers + 1 > limits.transfers) {
    return { code: 'transferQuota', limit: limits.transfers, message: `At most ${ limits.transfers } active transfers.` };
  }
  return null;
}

module.exports = { limitsFor, checkUpload };
