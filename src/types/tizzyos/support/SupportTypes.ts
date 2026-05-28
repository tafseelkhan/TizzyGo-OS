export interface SupportTicketRequest {
  subject: string;
  message: string;
  email?: string;
  phone?: string;
  attachment?: string;
}
