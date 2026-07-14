export interface ResolvedDeviceInfo {
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
}

export interface IDeviceInfoResolver {
  resolve(userAgent: string | null, ip: string | null): ResolvedDeviceInfo;
}

export const DEVICE_INFO_RESOLVER = Symbol('DEVICE_INFO_RESOLVER');
