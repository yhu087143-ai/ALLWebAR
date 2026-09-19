/** Check camera permission status without prompting */
export async function checkCameraPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (!navigator.mediaDevices?.enumerateDevices) return 'prompt';

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    if (videoDevices.length === 0) return 'denied';

    // Check permission status via Permissions API
    if (navigator.permissions?.query) {
      const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
      return result.state as 'granted' | 'denied' | 'prompt';
    }
  } catch { /* fall through */ }
  return 'prompt';
}

/** Request camera access with proper error handling */
export async function requestCameraPermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(t => t.stop());
    return true;
  } catch {
    return false;
  }
}
