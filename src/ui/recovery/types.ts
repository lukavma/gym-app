export interface RecoveryEntryDto {
  id: string;
  date: string;
  sleepHours: number | null;
  sleepQuality: number | null;
  readiness: number | null;
  soreness: number | null;
  note: string | null;
}
