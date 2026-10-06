import type { QuotaStatus } from "../../shared/types";

interface QuotaFooterProps {
  quota: QuotaStatus;
  onUpgrade: () => void;
  upgrading: boolean;
}

export default function QuotaFooter({ quota, onUpgrade, upgrading }: QuotaFooterProps) {
  return (
    <div className="footer">
      <span className="quota-text">
        {quota.unlimited ? (
          <strong>Unlimited searches (Premium)</strong>
        ) : (
          <>
            Daily Free Searches: <strong>{quota.used ?? 0}/{quota.limit ?? "—"}</strong>
          </>
        )}
      </span>
      {!quota.unlimited && (
        <button type="button" className="upgrade-btn" onClick={onUpgrade} disabled={upgrading}>
          {upgrading ? "Opening…" : "Upgrade to Premium"}
        </button>
      )}
    </div>
  );
}
