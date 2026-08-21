export type RealtimeTarget = { kind: 'user'; userId: string } | { kind: 'room'; roomId: string };

export interface RealtimeMessage {
  event: string;
  data: unknown;
}

export interface RealtimeGateway {
  publish(target: RealtimeTarget, message: RealtimeMessage): Promise<void>;
}
