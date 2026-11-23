/**
 * Persian, user-facing messages for the codes emitted by customer-assistant-core.
 * The API returns lower-case codes for generic failures and SCREAMING_CASE codes
 * for domain failures; both sets are covered here.
 */
const MESSAGES: Record<string, string> = {
  INTERNAL_ERROR: 'خطای غیرمنتظره‌ای در سرور رخ داد.',
  internal_error: 'خطای غیرمنتظره‌ای در سرور رخ داد.',
  not_found: 'موردی با این مشخصات یافت نشد.',
  conflict: 'این عملیات با وضعیت فعلی سرویس ناسازگار است.',
  service_unavailable: 'سرویس موقتاً در دسترس نیست.',
  invalid_operation: 'این عملیات مجاز نیست.',
  invalid_request: 'درخواست معتبر نیست.',
  empty_upload: 'فایل ارسالی خالی است.',
  upload_too_large: 'حجم فایل از سقف مجاز بیشتر است.',
  unsupported_upload: 'نوع فایل پشتیبانی نمی‌شود.',
  http_error: 'درخواست کامل نشد.',

  SESSION_NOT_FOUND: 'این گفتگو یافت نشد.',
  STORE_UNAVAILABLE: 'سرویس ذخیره‌سازی گفتگو در دسترس نیست.',
  UNAUTHENTICATED: 'برای انجام این کار باید احراز هویت شوید.',
  IDENTITY_UNAVAILABLE: 'سرویس احراز هویت در این استقرار پیکربندی نشده است.',
  INPUT_TOO_LARGE: 'پرسش شما از سقف حجم مجاز بیشتر است.',
  HISTORY_TOO_LARGE: 'تاریخچهٔ این گفتگو از سقف مجاز مدل بیشتر است؛ یک گفتگوی جدید بسازید.',
  PROVIDER_ERROR: 'تولید پاسخ در سرویس مدل ناموفق بود.',
  EMPTY_ANSWER: 'پاسخی از سرویس مدل دریافت نشد.',
  OUTPUT_LIMIT_REACHED: 'پاسخ به سقف طول مجاز رسید و ناقص ماند.',
  RETRIEVAL_FAILED: 'جست‌وجو در دانش‌گراف ناموفق بود.',
  CONTEXT_BUDGET_EXCEEDED: 'حجم زمینهٔ گفتگو از سقف مجاز بیشتر است.',
};

export function messageForCode(code?: string): string {
  if (!code) return 'درخواست کامل نشد.';
  return MESSAGES[code] ?? 'درخواست کامل نشد.';
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

interface ErrorEnvelope {
  error?: {
    code?: unknown;
    message?: unknown;
  };
  request_id?: unknown;
}

export async function toApiError(response: Response): Promise<ApiError> {
  let payload: ErrorEnvelope | null = null;
  try {
    payload = (await response.json()) as ErrorEnvelope;
  } catch {
    payload = null;
  }

  const rawCode = payload?.error?.code;
  const code = typeof rawCode === 'string' && rawCode ? rawCode : `http_${response.status}`;
  const rawMessage = payload?.error?.message;
  const serverMessage = typeof rawMessage === 'string' ? rawMessage : '';
  const requestId = typeof payload?.request_id === 'string' ? payload.request_id : undefined;
  const fallback = `درخواست با کد ${response.status} کامل نشد.`;
  const message = MESSAGES[code] ?? (serverMessage || fallback);

  return new ApiError(response.status, code, message, requestId);
}
