import { LogoutConfirmation } from "@/components/layout/logout-confirmation";

export default function AdminLogoutPage() {
  return (
    <LogoutConfirmation
      audienceLabel="Admin session"
      title="Leave the admin console?"
      description="Confirm before signing out of the ERP control room and returning to the admin login page."
      backHref="/dashboard"
      loginHref="/login"
    />
  );
}