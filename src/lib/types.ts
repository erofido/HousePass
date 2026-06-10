export type StaffRole = "staff" | "leadership";

export type OutingStatus =
  | "requested"
  | "approved"
  | "denied"
  | "cancelled"
  | "out"
  | "returned";

export interface House {
  id: string;
  name: string;
}

export interface Staff {
  id: string;
  full_name: string;
  email: string;
  role: StaffRole;
  house_id: string | null;
  active: boolean;
}

/** Student fields safe to show to staff and to the student themself. */
export interface Student {
  id: string;
  house_id: string;
  full_name: string;
  room: string | null;
  year_group: string | null;
  status: "in" | "out";
  active: boolean;
}

export const STUDENT_COLUMNS =
  "id, house_id, full_name, room, year_group, status, active";

export interface Location {
  id: string;
  house_id: string | null;
  name: string;
  requires_permission: boolean;
  active: boolean;
}

export interface Outing {
  id: string;
  student_id: string;
  house_id: string;
  location_id: string | null;
  location_text: string | null;
  status: OutingStatus;
  note: string | null;
  requested_at: string;
  approved_by: string | null;
  approved_at: string | null;
  expected_back_at: string | null;
  signed_out_at: string | null;
  signed_in_at: string | null;
  signed_out_via: string | null;
  signed_in_via: string | null;
  late_alerted_at: string | null;
  created_at: string;
}

export interface LiveBoardRow {
  outing_id: string;
  student_id: string;
  full_name: string;
  room: string | null;
  year_group: string | null;
  house_id: string;
  house_name: string;
  destination: string;
  requires_permission: boolean | null;
  signed_out_at: string;
  expected_back_at: string | null;
  late_alerted_at: string | null;
}
