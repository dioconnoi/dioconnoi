interface SignInButtonProps {
  loading: boolean;
  onSignIn: () => void;
}

export default function SignInButton({ loading, onSignIn }: SignInButtonProps) {
  return (
    <div className="signin-prompt">
      <p>Sign in with Google to check sponsor status, SOC codes and salary thresholds.</p>
      <button type="button" className="primary-btn" onClick={onSignIn} disabled={loading}>
        {loading ? <span className="spinner" /> : "Sign in with Google"}
      </button>
    </div>
  );
}
