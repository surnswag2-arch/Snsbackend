// i18n service — locale-aware message templates
// Templates use {{placeholder}} syntax for variable substitution

const MESSAGES: Record<string, Record<string, string>> = {
  en: {
    "notification.like": "{{actor}} liked your video",
    "notification.comment": "{{actor}} commented: {{text}}",
    "notification.follow": "{{actor}} started following you",
    "notification.mention": "{{actor}} mentioned you in a comment",
    "notification.milestone": "🎉 You reached {{count}} followers!",
    "notification.subscription": "{{actor}} subscribed to you",
    "video.upload.success": "Your video is being processed",
    "video.upload.failed": "Video processing failed. Please try again.",
    "video.status.processing": "Processing...",
    "video.status.ready": "Ready",
    "video.status.failed": "Failed",
    "comment.deleted": "Comment deleted",
    "report.submitted": "Report submitted. We'll review it shortly.",
    "follow.success": "You are now following {{target}}",
    "unfollow.success": "You have unfollowed {{target}}",
    "error.unauthorized": "Please log in to continue",
    "error.not_found": "Resource not found",
    "error.validation": "Invalid input: {{details}}",
    "error.rate_limited": "Too many requests. Please try again later.",
    "error.server_error": "Something went wrong. Please try again.",
    "auth.login.success": "Welcome back, {{name}}!",
    "auth.signup.success": "Welcome to Sur & Swag!",
    "auth.otp.sent": "OTP sent to your phone",
    "auth.otp.verified": "Phone number verified",
    "payment.checkout.success": "Payment successful!",
    "payment.subscription.created": "Subscription created successfully",
    "upload.presigned.ready": "Ready to upload",
    "search.no_results": "No results found",
  },
  bn: {
    "notification.like": "{{actor}} আপনার ভিডিও পছন্দ করেছে",
    "notification.comment": "{{actor}} মন্তব্য করেছে: {{text}}",
    "notification.follow": "{{actor}} আপনাকে ফলো করতে শুরু করেছে",
    "notification.mention": "{{actor}} একটি মন্তব্যে আপনাকে উল্লেখ করেছে",
    "notification.milestone": "🎉 আপনি {{count}} ফলোয়ার পেয়েছেন!",
    "notification.subscription": "{{actor}} আপনার সাবস্ক্রাইব করেছে",
    "video.upload.success": "আপনার ভিডিও প্রসেস করা হচ্ছে",
    "video.upload.failed": "ভিডিও প্রসেসিং ব্যর্থ হয়েছে। আবার চেষ্টা করুন।",
    "video.status.processing": "প্রসেসিং...",
    "video.status.ready": "প্রস্তুত",
    "video.status.failed": "ব্যর্থ",
    "comment.deleted": "মন্তব্য মুছে ফেলা হয়েছে",
    "report.submitted": "রিপোর্ট জমা দেওয়া হয়েছে। আমরা শীঘ্রই পর্যালোচনা করব।",
    "follow.success": "আপনি এখন {{target}} কে ফলো করছেন",
    "unfollow.success": "আপনি {{target}} কে আনফলো করেছেন",
    "error.unauthorized": "চালিয়ে যেতে লগ ইন করুন",
    "error.not_found": "রিসোর্স পাওয়া যায়নি",
    "error.validation": "ভুল ইনপুট: {{details}}",
    "error.rate_limited": "অনেক বেশি অনুরোধ। পরে আবার চেষ্টা করুন।",
    "error.server_error": "কিছু সমস্যা হয়েছে। আবার চেষ্টা করুন।",
    "auth.login.success": "স্বাগতম, {{name}}!",
    "auth.signup.success": "সুর ও স্বাগ-এ আপনাকে স্বাগতম!",
    "auth.otp.sent": "ওটিপি আপনার ফোনে পাঠানো হয়েছে",
    "auth.otp.verified": "ফোন নম্বর নিশ্চিত করা হয়েছে",
    "payment.checkout.success": "পেমেন্ট সফল হয়েছে!",
    "payment.subscription.created": "সাবস্ক্রিপশন সফলভাবে তৈরি হয়েছে",
    "upload.presigned.ready": "আপলোডের জন্য প্রস্তুত",
    "search.no_results": "কোনো ফলাফল পাওয়া যায়নি",
  },
  hi: {
    "notification.like": "{{actor}} ने आपका वीडियो पसंद किया",
    "notification.comment": "{{actor}} ने टिप्पणी की: {{text}}",
    "notification.follow": "{{actor}} ने आपको फ़ॉलो करना शुरू किया",
    "error.unauthorized": "जारी रखने के लिए कृपया लॉग इन करें",
    "error.validation": "अमान्य इनपुट: {{details}}",
    "auth.login.success": "स्वागत है, {{name}}!",
  },
};

export class I18nService {
  private locale: string;

  constructor(locale = "bn") {
    this.locale = SUPPORTED_LOCALES.includes(locale) ? locale : "bn";
  }

  static translate(key: string, locale: string, vars?: Record<string, string>): string {
    const messages = MESSAGES[locale] || MESSAGES["bn"];
    let message = messages[key] || key;

    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        message = message.replace(`{{${k}}}`, v);
      }
    }

    return message;
  }

  t(key: string, vars?: Record<string, string>): string {
    return I18nService.translate(key, this.locale, vars);
  }
}

const SUPPORTED_LOCALES = ["bn", "en", "hi"];
export { SUPPORTED_LOCALES };
