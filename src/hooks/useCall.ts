import { useState, useEffect, useRef, useCallback } from 'react';
import { WebRTCCallManager } from '../services/webrtc';
import * as socketService from '../services/socket';
import type { CallState, CallInfo, CallStats, ConnectionQuality } from '../types/call';
import { generateCallId } from '../types/call';

export interface UseCallResult {
  callState: CallState;
  callInfo: CallInfo | null;
  callStats: CallStats | null;
  connectionQuality: ConnectionQuality;
  error: string | null;
  startCall: (receiverId: string, receiverName: string, stream: MediaStream) => void;
  acceptCall: (stream: MediaStream) => void;
  rejectCall: (reason?: string) => void;
  endCall: () => void;
  isMuted: boolean;
  toggleMute: () => void;
}

export function useCall(userId: string, userName: string): UseCallResult {
  const [callState, setCallState] = useState<CallState>('idle');
  const [callInfo, setCallInfo] = useState<CallInfo | null>(null);
  const [callStats, setCallStats] = useState<CallStats | null>(null);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>('good');
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const callManagerRef = useRef<WebRTCCallManager | null>(null);
  const timeoutsRef = useRef<{
    outgoing?: ReturnType<typeof setTimeout>;
    ringing?: ReturnType<typeof setTimeout>;
    connecting?: ReturnType<typeof setTimeout>;
  }>({});

  const clearAllTimeouts = useCallback(() => {
    if (timeoutsRef.current.outgoing) clearTimeout(timeoutsRef.current.outgoing);
    if (timeoutsRef.current.ringing) clearTimeout(timeoutsRef.current.ringing);
    if (timeoutsRef.current.connecting) clearTimeout(timeoutsRef.current.connecting);
    timeoutsRef.current = {};
  }, []);

  const handleCleanup = useCallback((reason?: string) => {
    clearAllTimeouts();
    if (callManagerRef.current) {
      callManagerRef.current.cleanup();
      callManagerRef.current = null;
    }
    setCallState('idle');
    setCallInfo(null);
    setCallStats(null);
    if (reason) setError(reason);
  }, [clearAllTimeouts]);

  // Handle incoming socket events
  useEffect(() => {
    socketService.onIncomingCall((data) => {
      if (callState !== 'idle') {
        // We are busy
        socketService.emitCallRejected({ callId: data.callId, receiverId: userId, reason: 'busy' });
        return;
      }
      setCallInfo({
        callId: data.callId,
        callerId: data.callerId,
        callerName: data.callerName,
        receiverId: userId,
        receiverName: userName,
        startedAt: Date.now(),
      });
      setCallState('ringing');
      setError(null);
      // Ringing timeout (45s)
      timeoutsRef.current.ringing = setTimeout(() => {
        handleCleanup('Call timed out');
      }, 45000);
    });

    socketService.onCallAccepted(async (data) => {
      if (callState !== 'calling' || !callInfo || callInfo.callId !== data.callId) return;
      clearAllTimeouts();
      setCallState('connecting');

      // Create WebRTC Offer
      try {
        const pc = callManagerRef.current!;
        const offer = await pc.createOffer();
        socketService.emitOffer({
          callId: data.callId,
          fromUserId: userId,
          targetUserId: callInfo.receiverId,
          offer
        });
      } catch (err) {
        console.error('[CALL] Failed to create offer:', err);
        handleCleanup('Failed to establish connection');
      }
    });

    socketService.onCallRejected((data) => {
      if (!callInfo || callInfo.callId !== data.callId) return;
      handleCleanup(`Call rejected: ${data.reason || 'User declined'}`);
    });

    socketService.onOffer(async (data) => {
      if (!callInfo || callInfo.callId !== data.callId || !callManagerRef.current) return;
      try {
        const answer = await callManagerRef.current.handleOffer(data.offer);
        socketService.emitAnswer({
          callId: data.callId,
          fromUserId: userId,
          targetUserId: data.fromUserId,
          answer
        });
      } catch (err) {
        console.error('[CALL] Failed to handle offer:', err);
        handleCleanup('WebRTC connection failed');
      }
    });

    socketService.onAnswer(async (data) => {
      if (!callInfo || callInfo.callId !== data.callId || !callManagerRef.current) return;
      try {
        await callManagerRef.current.handleAnswer(data.answer);
      } catch (err) {
        console.error('[CALL] Failed to handle answer:', err);
        handleCleanup('WebRTC connection failed');
      }
    });

    socketService.onIceCandidate(async (data) => {
      if (!callInfo || callInfo.callId !== data.callId || !callManagerRef.current) return;
      try {
        await callManagerRef.current.addIceCandidate(data.candidate);
      } catch (err) {
        console.error('[CALL] Failed to add ICE candidate:', err);
      }
    });

    socketService.onCallEnded((data) => {
      if (!callInfo || callInfo.callId !== data.callId) return;
      handleCleanup(data.reason ? `Call ended: ${data.reason}` : undefined);
    });

    return () => {
      socketService.removeAllCallListeners();
    };
  }, [callState, callInfo, userId, userName, handleCleanup, clearAllTimeouts]);

  const initWebRTC = useCallback((stream: MediaStream) => {
    const cm = new WebRTCCallManager({
      onStateChange: setCallState,
      onRemoteStream: (remoteStream) => {
        // UI handles this if needed, but WebRTCCallManager already creates the Audio element
      },
      onStats: (stats, quality) => {
        setCallStats(stats);
        setConnectionQuality(quality);
      },
      onError: (msg) => setError(msg),
    });
    cm.createPeerConnection(); // Creates PC and sets up handlers

    // Setup ICE candidate forwarding
    cm.onIceCandidate = (candidate: RTCIceCandidateInit) => {
      if (!callInfo) return;
      const targetUserId = callInfo.callerId === userId ? callInfo.receiverId : callInfo.callerId;
      socketService.emitIceCandidate({
        callId: callInfo.callId,
        fromUserId: userId,
        targetUserId,
        candidate
      });
    };

    cm.addLocalTrack(stream);
    callManagerRef.current = cm;
  }, [callInfo, userId]);

  const startCall = useCallback((receiverId: string, receiverName: string, stream: MediaStream) => {
    if (callState !== 'idle') return;
    setError(null);
    const newCallId = generateCallId();
    setCallInfo({
      callId: newCallId,
      callerId: userId,
      callerName: userName,
      receiverId,
      receiverName,
      startedAt: Date.now()
    });
    setCallState('calling');
    initWebRTC(stream);

    socketService.emitCallUser({
      callId: newCallId,
      callerId: userId,
      callerName: userName,
      receiverId
    });

    // Outgoing timeout (30s)
    timeoutsRef.current.outgoing = setTimeout(() => {
      socketService.emitEndCall({ callId: newCallId, fromUserId: userId, reason: 'timeout' });
      handleCleanup('Call timed out. Receiver did not answer.');
    }, 30000);
  }, [callState, userId, userName, initWebRTC, handleCleanup]);

  const acceptCall = useCallback((stream: MediaStream) => {
    if (callState !== 'ringing' || !callInfo) return;
    clearAllTimeouts();
    setCallState('connecting');
    initWebRTC(stream);

    socketService.emitCallAccepted({
      callId: callInfo.callId,
      receiverId: userId,
      receiverName: userName
    });

    // Connection timeout (15s)
    timeoutsRef.current.connecting = setTimeout(() => {
      handleCleanup('Connection timed out');
    }, 15000);
  }, [callState, callInfo, userId, userName, initWebRTC, clearAllTimeouts, handleCleanup]);

  const rejectCall = useCallback((reason: string = 'declined') => {
    if (!callInfo) return;
    socketService.emitCallRejected({ callId: callInfo.callId, receiverId: userId, reason });
    handleCleanup();
  }, [callInfo, userId, handleCleanup]);

  const endCall = useCallback(() => {
    if (callInfo) {
      socketService.emitEndCall({ callId: callInfo.callId, fromUserId: userId, reason: 'ended_by_user' });
    }
    handleCleanup();
  }, [callInfo, userId, handleCleanup]);

  const toggleMute = useCallback(() => {
    if (!callManagerRef.current) return;
    setIsMuted((prev) => {
      const next = !prev;
      callManagerRef.current?.setLocalAudioEnabled(!next);
      return next;
    });
  }, []);

  return {
    callState,
    callInfo,
    callStats,
    connectionQuality,
    error,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    isMuted,
    toggleMute
  };
}
