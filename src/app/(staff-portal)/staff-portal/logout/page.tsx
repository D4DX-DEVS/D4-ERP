import { LogoutConfirmation } from "@/components/layout/logout-confirmation";

export default function StaffLogoutPage() {
  return (
    <LogoutConfirmation
      audienceLabel="Staff session"
      title="Sign out of your portal?"
      description="Confirm before ending this session and returning to the staff login page."
      backHref="/staff-portal"
      loginHref="/staff-login"
    />
  );
}