import type { CallInfo } from '../types/call';

interface Props {
  callInfo: CallInfo;
  onAccept: () => void;
  onReject: () => void;
}

export default function IncomingCall({ callInfo, onAccept, onReject }: Props) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card incoming-call-modal">
        <div className="incoming-avatar-wrap pulse-ring">
          <div className="incoming-avatar" style={{ backgroundColor: '#00F576' }}>
            {callInfo.callerName.slice(0, 2).toUpperCase()}
          </div>
        </div>
        <div className="incoming-details">
          <h2>{callInfo.callerName}</h2>
          <p>Incoming ClearVoice Call...</p>
        </div>
        <div className="modal-actions-row split-actions">
          <button className="btn btn-primary btn-lg accept-btn" onClick={onAccept}>
            <span className="icon">📞</span> ACCEPT
          </button>
          <button className="btn btn-danger btn-lg reject-btn" onClick={onReject}>
            <span className="icon">✕</span> REJECT
          </button>
        </div>
      </div>
    </div>
  );
}
