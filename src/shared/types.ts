export type PunchAction = "in" | "out" | "toggle";

export interface PunchRecord {
  id: number;
  userId: number;
  action: Exclude<PunchAction, "toggle">;
  at: string;
  source?: string;
  ip?: string;
  userAgent?: string;
  lat?: number | null;
  lng?: number | null;
  note?: string;
}

export interface WorkSessionRecord {
  id: number;
  userId: number;
  startedAt: string;
  endedAt?: string;
  createdFromPunchId?: number;
  closedFromPunchId?: number;
}

export interface PunchStatusResponse {
  status: "in" | "out";
  lastPunch: PunchRecord | null;
  openSession: WorkSessionRecord | null;
  recentPunches: PunchRecord[];
}

export interface PunchRequest {
  action: PunchAction;
  note?: string;
  lat?: number | null;
  lng?: number | null;
}

export interface PunchResponse extends PunchStatusResponse {
  recordedPunch: PunchRecord;
}
