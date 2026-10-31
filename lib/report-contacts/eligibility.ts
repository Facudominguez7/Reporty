export function canShowReportContacts(moderation: string | undefined, withdrawn: boolean) {
  return moderation === "APPROVED" && !withdrawn
}
