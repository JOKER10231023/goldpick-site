/* Public website setting only.
 * After deploying the private Cloudflare Worker, set apiBase to its exact HTTPS URL.
 * Example: "https://goldpick-payments.YOUR_ACCOUNT.workers.dev"
 * This file must NEVER contain NOWPayments or Supabase secret keys.
 */
window.GOLDPICK_PAYMENT_CONFIG = {apiBase:""};
