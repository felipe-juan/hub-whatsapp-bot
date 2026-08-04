'use strict';
function deliveryPayload(text, options = {}) { return { text: String(text || ''), ...options }; }
function isRetryable(error) { return !/forbidden|not-authorized|logged.?out/i.test(String(error?.message || error || '')); }
module.exports = { deliveryPayload, isRetryable };
