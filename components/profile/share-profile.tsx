'use client';
import { useState } from 'react';
export function ShareProfile({userId,visibility}:{userId:string;visibility:string}) {
  const [message,setMessage] = useState('');
  async function share() {
    try {
      await navigator.clipboard.writeText(new URL(`/study-profile/${encodeURIComponent(userId)}`, window.location.origin).href);
      setMessage(visibility === 'private' ? 'Link copied. Your profile is private; change visibility to let others view it.' : visibility === 'buddies' ? 'Link copied. Only eligible study buddies can view it.' : 'Profile link copied.');
    } catch { setMessage('Could not copy. Open View profile and copy its address.'); }
  }
  return <div className="student-profile-share"><button type="button" className="student-profile-button" onClick={share}>Share profile</button>{message ? <span role="status">{message}</span> : null}</div>;
}
