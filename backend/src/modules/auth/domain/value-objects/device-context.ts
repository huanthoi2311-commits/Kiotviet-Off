import { SessionClientType } from '../entities/session.entity';

export interface DeviceContext {
  userAgent: string | null;
  ip: string | null;
  clientType: SessionClientType;
  /** Tên thiết bị do client tự đặt (chủ yếu Mobile App gửi lên, VD: "iPhone của Nam"). */
  deviceName?: string | null;
}
