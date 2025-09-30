import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  PunchAction,
  PunchRecord,
  PunchResponse,
  PunchStatusResponse,
} from "../shared/types";

const formatDateTime = (isoString: string) => {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const actionLabel = (action: PunchRecord["action"]) =>
  action === "in" ? "出勤" : "退勤";

const actionBadgeColor = (status: "in" | "out") =>
  status === "in" ? "in" : "out";

const notePlaceholder =
  "体調や作業場所など、共有したいことがあれば入力してください";

async function getCurrentPosition(): Promise<GeolocationPosition | null> {
  if (!("geolocation" in navigator)) {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 1000 * 60 * 5,
      }
    );
  });
}

export default function App() {
  const [status, setStatus] = useState<PunchStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/status");
      if (!response.ok) {
        throw new Error("ステータスの取得に失敗しました");
      }
      const body: PunchStatusResponse = await response.json();
      setStatus(body);
    } catch (err) {
      console.error(err);
      setError("ステータスの取得に失敗しました");
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 30_000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const openSessionStartedAt = useMemo(() => {
    if (!status?.openSession?.startedAt) {
      return null;
    }
    return formatDateTime(status.openSession.startedAt);
  }, [status?.openSession?.startedAt]);

  const handlePunch = useCallback(
    async (action: PunchAction) => {
      if (loading) {
        return;
      }

      setLoading(true);
      setError(null);

      if (!navigator.onLine) {
        setError("オフラインのため送信できません。ネットワークに接続してください。");
        setLoading(false);
        return;
      }

      try {
        const position = await getCurrentPosition();
        const coords = position?.coords;

        const response = await fetch("/api/punch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            note: note.trim() ? note.trim() : undefined,
            lat: coords?.latitude,
            lng: coords?.longitude,
          }),
        });

        if (!response.ok) {
          throw new Error("打刻に失敗しました");
        }

        const body: PunchResponse = await response.json();
        setStatus(body);
        setNote("");
      } catch (err) {
        console.error(err);
        setError("打刻に失敗しました。時間をおいて再度お試しください。");
      } finally {
        setLoading(false);
      }
    },
    [loading, note]
  );

  const isClockedIn = status?.status === "in";

  return (
    <div className="app-container">
      {loading && <div className="loading-overlay">送信中...</div>}
      <header>
        <h1>TapTime</h1>
        <p>iPhoneからいつでもサッと出退勤打刻</p>
        {!isOnline && (
          <div className="offline-banner">
            <span role="img" aria-label="offline">
              📴
            </span>
            現在オフラインです
          </div>
        )}
      </header>

      <section className="status-card">
        <div className="status-indicator">
          <span className={`badge ${actionBadgeColor(status?.status ?? "out")}`}>
            {status?.status === "in" ? "勤務中" : "退勤中"}
          </span>
          <span>
            {status?.status === "in"
              ? "今日もお疲れさまです！"
              : "勤務を開始する準備はできていますか？"}
          </span>
        </div>
        {status?.lastPunch && (
          <div className="status-time">
            最終打刻：{formatDateTime(status.lastPunch.at)}（
            {actionLabel(status.lastPunch.action)}）
          </div>
        )}
        {openSessionStartedAt && (
          <div className="status-time">勤務開始：{openSessionStartedAt}</div>
        )}
        <div className="action-buttons">
          <button
            type="button"
            className="action-button primary"
            onClick={() => handlePunch("in")}
            disabled={loading || isClockedIn}
          >
            出勤する
          </button>
          <button
            type="button"
            className="action-button secondary"
            onClick={() => handlePunch("out")}
            disabled={loading || !isClockedIn}
          >
            退勤する
          </button>
        </div>
        <label htmlFor="note">メモ（任意）</label>
        <textarea
          id="note"
          className="note-input"
          placeholder={notePlaceholder}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={200}
        />
        {error && <p style={{ color: "#ef4444", margin: 0 }}>{error}</p>}
      </section>

      <section className="history">
        <h2>最近の打刻</h2>
        {status?.recentPunches?.length ? (
          <ul>
            {status.recentPunches.map((punch) => (
              <li key={punch.id}>
                <span className={`action ${punch.action}`}>
                  {actionLabel(punch.action)}
                </span>
                <span className="time">{formatDateTime(punch.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>まだ打刻はありません。</p>
        )}
      </section>

      <p className="footer-note">
        ホーム画面に追加して、ワンタップで出退勤できます。
      </p>
    </div>
  );
}
