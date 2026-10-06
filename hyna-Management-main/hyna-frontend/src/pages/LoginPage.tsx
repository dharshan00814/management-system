import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores';
import { cn } from '@/lib/utils';

interface BubbleParticle {
  id: number;
  x: number;
  y: number;
  size: number;
  driftX: number;
  duration: number;
}

const css = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

.su-page * {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.su-page {
  min-height: 100vh;
  width: 100vw;
  background-color: #0a0e07;
  background-image: 
    radial-gradient(circle at 50% 50%, #29381c 0%, #1b2612 36%, #0e140a 70%, #060904 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  color: #f2f2f2;
  position: relative;
  overflow-x: hidden;
  overflow-y: auto;
}

/* Ambient background glowing bubbles */
.su-ambient-bubbles {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 1;
}

.su-ambient-bubble {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  will-change: transform, opacity;
}

.su-amb-center {
  width: 520px;
  height: 520px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle, rgba(187, 244, 81, 0.16) 0%, rgba(140, 205, 45, 0.05) 50%, transparent 70%);
  filter: blur(65px);
  animation: pulseAmbCenter 7s ease-in-out infinite alternate;
}

.su-amb-1 {
  width: 440px;
  height: 440px;
  top: -60px;
  left: -80px;
  background: radial-gradient(circle, rgba(195, 248, 95, 0.22) 0%, rgba(150, 220, 55, 0.08) 50%, transparent 70%);
  filter: blur(60px);
  animation: floatAmb1 13s ease-in-out infinite alternate;
}

.su-amb-2 {
  width: 460px;
  height: 460px;
  bottom: -80px;
  right: -90px;
  background: radial-gradient(circle, rgba(187, 244, 81, 0.2) 0%, rgba(140, 210, 45, 0.07) 52%, transparent 70%);
  filter: blur(65px);
  animation: floatAmb2 15s ease-in-out infinite alternate;
}

@keyframes floatAmb1 {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(50px, 40px) scale(1.1); }
}

@keyframes floatAmb2 {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(-45px, -50px) scale(1.08); }
}

@keyframes pulseAmbCenter {
  0% { opacity: 0.35; transform: translate(-50%, -50%) scale(0.95); }
  100% { opacity: 0.65; transform: translate(-50%, -50%) scale(1.12); }
}

.su-card {
  width: 100%;
  max-width: 420px;
  background: #14161c;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 38px;
  padding: 46px 34px 38px;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  z-index: 10;
  /* Authentic Claymorphic Volume & Depth */
  box-shadow: 
    inset 4px 4px 10px rgba(255, 255, 255, 0.12),
    inset 1px 1px 3px rgba(255, 255, 255, 0.22),
    inset -8px -8px 18px rgba(0, 0, 0, 0.75),
    inset -2px -2px 6px rgba(0, 0, 0, 0.9),
    20px 28px 55px -10px rgba(0, 0, 0, 0.85),
    -8px -8px 24px rgba(255, 255, 255, 0.02),
    0 0 50px rgba(187, 244, 81, 0.07);
  animation: suCardReveal 0.65s cubic-bezier(0.16, 1, 0.3, 1) both;
  transition: all 0.3s ease;
}

@keyframes suCardReveal {
  from {
    opacity: 0.88;
    transform: scale(0.97);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.su-logo {
  width: 54px;
  height: 54px;
  object-fit: contain;
  margin-bottom: 22px;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.5));
  transition: transform 0.2s ease;
}
.su-logo:hover {
  transform: scale(1.05);
}

/* Claymorphic Badge Pill */
.su-badge {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  font-weight: 500;
  color: #9da3af;
  background: #191b22;
  border: 1px solid rgba(255, 255, 255, 0.07);
  padding: 7px 18px;
  border-radius: 9999px;
  margin-bottom: 22px;
  letter-spacing: 0.2px;
  text-align: center;
  box-shadow: 
    inset 2px 2px 4px rgba(255, 255, 255, 0.09),
    inset -2px -2px 5px rgba(0, 0, 0, 0.65),
    0 4px 12px rgba(0, 0, 0, 0.35);
}

.su-title {
  font-size: 25px;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: -0.3px;
  margin-bottom: 8px;
  text-align: center;
}

.su-subtitle {
  font-size: 13.5px;
  color: #848b99;
  line-height: 1.45;
  margin-bottom: 28px;
  text-align: center;
  max-width: 290px;
}

.su-err {
  width: 100%;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.28);
  color: #fca5a5;
  padding: 10px 14px;
  border-radius: 14px;
  margin-bottom: 16px;
  font: 400 12px 'JetBrains Mono', monospace;
  line-height: 1.4;
  text-align: center;
  box-shadow: inset 2px 2px 4px rgba(0, 0, 0, 0.4);
}

.su-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.su-field {
  position: relative;
  width: 100%;
  height: 52px;
  margin-bottom: 15px;
}

/* Claymorphic Sunken Input Slot */
.su-field input {
  width: 100%;
  height: 100%;
  background: #0f1015;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 0 18px;
  font-size: 14.5px;
  color: #ffffff;
  outline: none;
  transition: all 0.2s ease;
  box-shadow: 
    inset 3px 3px 6px rgba(0, 0, 0, 0.75),
    inset -2px -2px 4px rgba(255, 255, 255, 0.05),
    0 1px 2px rgba(0, 0, 0, 0.2);
}

.su-field input::placeholder {
  color: #555b68;
}

.su-field input:focus {
  border-color: rgba(187, 244, 81, 0.45);
  background: #111218;
  box-shadow: 
    inset 3px 3px 6px rgba(0, 0, 0, 0.8),
    inset -2px -2px 4px rgba(255, 255, 255, 0.08),
    0 0 0 3px rgba(187, 244, 81, 0.18);
}

.su-field.password input {
  padding-right: 48px;
}

.su-eye-btn {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: #5d6371;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border-radius: 8px;
  transition: color 0.15s ease, transform 0.15s ease;
}

.su-eye-btn:hover {
  color: #ffffff;
  transform: translateY(-50%) scale(1.08);
}

.su-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin: 4px 0 24px 0;
}

.su-remember {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  cursor: pointer;
  user-select: none;
}

/* Claymorphic 3D Checkbox */
.su-checkbox-box {
  width: 19px;
  height: 19px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.su-checkbox-box.checked {
  background: #bbf451;
  border: 1px solid rgba(255, 255, 255, 0.7);
  color: #0b1104;
  box-shadow: 
    inset 2px 2px 3px rgba(255, 255, 255, 0.85),
    inset -2px -2px 3px rgba(110, 175, 20, 0.65),
    0 4px 10px rgba(187, 244, 81, 0.35);
}

.su-checkbox-box.unchecked {
  background: #0f1015;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 
    inset 2px 2px 4px rgba(0, 0, 0, 0.75),
    inset -1px -1px 2px rgba(255, 255, 255, 0.05);
}

.su-remember-text {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12.5px;
  color: #888f9d;
}

.su-forgot-btn {
  background: transparent;
  border: none;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12.5px;
  color: #7b8290;
  cursor: pointer;
  padding: 0;
  transition: color 0.15s ease;
}

.su-forgot-btn:hover {
  color: #ffffff;
}

/* Claymorphic 3D Lime Button */
.su-submit-btn {
  width: 100%;
  height: 52px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 18px;
  background: linear-gradient(135deg, #c5fb5a 0%, #bbf451 55%, #a5ea32 100%);
  color: #080d03;
  font-size: 15.5px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  box-shadow: 
    inset 3px 3px 6px rgba(255, 255, 255, 0.85),
    inset -4px -4px 8px rgba(100, 160, 15, 0.65),
    0 12px 28px -4px rgba(187, 244, 81, 0.5),
    0 6px 14px rgba(0, 0, 0, 0.35);
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.su-submit-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -120%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.55) 50%,
    transparent 100%
  );
  transform: skewX(-20deg);
  transition: left 0.65s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: none;
}

.su-submit-btn:hover:not(:disabled)::before {
  left: 140%;
}

.su-submit-btn:hover:not(:disabled) {
  transform: translateY(-2px) scale(1.008);
  filter: brightness(1.03);
  box-shadow: 
    inset 3px 3px 7px rgba(255, 255, 255, 0.95),
    inset -4px -4px 8px rgba(100, 160, 15, 0.65),
    0 16px 36px -4px rgba(187, 244, 81, 0.65),
    0 8px 18px rgba(0, 0, 0, 0.4);
}

.su-submit-btn:active:not(:disabled) {
  transform: translateY(1px) scale(0.99);
  box-shadow: 
    inset 4px 4px 8px rgba(95, 155, 12, 0.75),
    inset -2px -2px 4px rgba(255, 255, 255, 0.6),
    0 4px 12px rgba(187, 244, 81, 0.3);
}

.su-submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
}

/* Dynamic Click Burst Bubbles */
.su-click-bubble {
  position: fixed;
  border-radius: 50%;
  pointer-events: none;
  z-index: 99999;
  background: radial-gradient(
    circle at 35% 28%,
    rgba(255, 255, 255, 0.98) 0%,
    rgba(235, 255, 170, 0.85) 25%,
    rgba(187, 244, 81, 0.5) 55%,
    rgba(150, 220, 45, 0.2) 75%,
    transparent 100%
  );
  border: 1px solid rgba(255, 255, 255, 0.65);
  box-shadow: 
    0 0 16px rgba(187, 244, 81, 0.75),
    inset 0 2px 4px rgba(255, 255, 255, 0.95),
    inset 0 -2px 4px rgba(130, 195, 30, 0.5);
  animation: floatUpBurst var(--bubble-duration, 1.6s) cubic-bezier(0.2, 0.8, 0.3, 1) forwards;
}

@keyframes floatUpBurst {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) translate(0, 0) scale(0.3);
  }
  15% {
    opacity: 1;
    transform: translate(-50%, -50%) translate(calc(var(--drift-x) * 0.2), -30px) scale(1);
  }
  60% {
    opacity: 0.9;
    transform: translate(-50%, -50%) translate(calc(var(--drift-x) * 0.7), -120px) scale(1.18);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) translate(var(--drift-x), -240px) scale(1.35);
  }
}

@media (max-width: 480px) {
  .su-card {
    padding: 36px 22px 28px;
    border-radius: 26px;
  }
}
`;

export function LoginPage() {
  const navigate = useNavigate();
  const { login, signUp, setActiveOrganization, activeOrganization } = useAuthStore();
  const submitBtnRef = useRef<HTMLButtonElement | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loginStep, setLoginStep] = useState(1);

  // Burst bubbles on click
  const [bubbles, setBubbles] = useState<BubbleParticle[]>([]);

  const spawnBubbles = (originX?: number, originY?: number, count = 22) => {
    let x = originX;
    let y = originY;

    if (x === undefined || y === undefined) {
      if (submitBtnRef.current) {
        const rect = submitBtnRef.current.getBoundingClientRect();
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      } else {
        x = window.innerWidth / 2;
        y = window.innerHeight / 2;
      }
    }

    const rect = submitBtnRef.current?.getBoundingClientRect();
    const btnWidth = rect ? rect.width : 280;

    const newParticles: BubbleParticle[] = [];
    for (let i = 0; i < count; i++) {
      const size = Math.floor(Math.random() * 26) + 14; // 14px to 40px
      const spreadX = (Math.random() - 0.5) * (btnWidth * 0.95);
      const driftX = (Math.random() - 0.5) * 160;
      const duration = 1.3 + Math.random() * 0.8; // 1.3s to 2.1s

      newParticles.push({
        id: Date.now() + Math.random(),
        x: x + spreadX,
        y: y + (Math.random() - 0.5) * 18,
        size,
        driftX,
        duration,
      });
    }

    setBubbles((prev) => [...prev, ...newParticles]);

    setTimeout(() => {
      setBubbles((prev) => prev.filter((p) => !newParticles.some((np) => np.id === p.id)));
    }, 2400);
  };

  // Continuous subtle rising bubbles while authenticating
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      spawnBubbles(undefined, undefined, 4);
    }, 300);
    return () => clearInterval(interval);
  }, [isLoading]);

  const searchParams = new URLSearchParams(window.location.search);
  const inviteOrg = searchParams.get('org') || searchParams.get('invite') || '';
  const isInvite = !!inviteOrg;

  const [isRegistering, setIsRegistering] = useState(isInvite);
  const [orgName, setOrgName] = useState(inviteOrg);
  const [fullName, setFullName] = useState('');

  const executeLogin = async (loginId: string, loginPass: string) => {
    // ... existing logic ...
    const trimmedId = loginId.trim();
    if (!trimmedId || !loginPass) {
      setErrorMessage('Please enter your email or username and password.');
      return;
    }

    setErrorMessage('');
    setIsLoading(true);

    try {
      const result = await login(trimmedId, loginPass);

      if (!result.success) {
        setErrorMessage(result.error || 'Invalid credentials or user not found.');
        toast.error(result.error || 'Authentication failed');
        setIsLoading(false);
        return;
      }

      toast.success('Authenticated successfully. Loading your dashboard...');

      let targetRoute = '/member/dashboard';
      if (result.role === 'admin') {
        targetRoute = '/admin/dashboard';
      } else if (result.role === 'manager') {
        targetRoute = '/manager/dashboard';
      }

      navigate(targetRoute, { replace: true });
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMessage(err?.message || 'Unexpected authentication error');
      toast.error('Could not authenticate');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    spawnBubbles();
    
    if (!isRegistering && loginStep === 1) {
      if (!orgName.trim()) {
        setErrorMessage('Please enter your workspace or organization name.');
        return;
      }
      setErrorMessage('');
      setActiveOrganization(orgName.trim());
      setLoginStep(2);
      return;
    }

    await executeLogin(identifier, password);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    spawnBubbles();
    
    if (!fullName.trim() || !identifier.trim() || !password || !orgName.trim()) {
      setErrorMessage('All fields are required to register an organization.');
      return;
    }
    
    setIsLoading(true);
    setErrorMessage('');
    
    try {
      const result = await signUp({
        email: identifier,
        password: password,
        name: fullName,
        orgName: orgName,
        isInvite: isInvite,
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Failed to register organization');
        setIsLoading(false);
        return;
      }

      toast.info(`Organization "${orgName}" created.`);
      setActiveOrganization(orgName.trim());
      toast.success(`Welcome ${fullName}! Workspace "${orgName}" created successfully.`);

      if (result.session) {
        let targetRoute = '/member/dashboard';
        if (result.role === 'admin') {
          targetRoute = '/admin/dashboard';
        } else if (result.role === 'manager') {
          targetRoute = '/manager/dashboard';
        }
        navigate(targetRoute, { replace: true });
      } else {
        setIsRegistering(false);
        setIsLoading(false);
        toast.info('Please check your email to confirm registration.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to register organization');
      setIsLoading(false);
    }
  };

  const handleButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    spawnBubbles(e.clientX, e.clientY, 24);
  };

  return (
    <div className="su-page">
      <style>{css}</style>

      {/* Floating Dynamic Click Bubbles */}
      {bubbles.map((b) => (
        <div
          key={b.id}
          className="su-click-bubble"
          style={
            {
              left: `${b.x}px`,
              top: `${b.y}px`,
              width: `${b.size}px`,
              height: `${b.size}px`,
              '--drift-x': `${b.driftX}px`,
              '--bubble-duration': `${b.duration}s`,
            } as React.CSSProperties
          }
        />
      ))}

      {/* Ambient background glowing bubbles */}
      <div className="su-ambient-bubbles" aria-hidden="true">
        <div className="su-ambient-bubble su-amb-center" />
        <div className="su-ambient-bubble su-amb-1" />
        <div className="su-ambient-bubble su-amb-2" />
      </div>

      <section className="su-card">
        {/* Welcome Pill Badge */}
        <div className="su-badge">
          Welcome to the SaaS platform
        </div>

        {/* Title & Subtitle */}
        <h1 className="su-title">{isRegistering ? 'Register Workspace' : 'Sign in account'}</h1>
        <p className="su-subtitle">
          {isRegistering 
            ? 'Create your organization and start managing your team' 
            : 'Enter your credentials to access your account'}
        </p>

        {/* Error message */}
        {errorMessage && <div className="su-err">{errorMessage}</div>}

        {/* Login / Register Form */}
        <form onSubmit={isRegistering ? handleRegister : handleSignIn} className="su-form">
          
          {isRegistering && (
            <>
              <div className="su-field">
                <input
                  type="text"
                  placeholder="Full Name"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  required
                />
              </div>
              <div className="su-field relative">
                <input
                  type="text"
                  placeholder="Organization / Company Name"
                  value={orgName}
                  onChange={(e) => {
                    setOrgName(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  required
                  readOnly={isInvite}
                  style={isInvite ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
                />
                {isInvite && (
                  <div className="text-xs text-indigo-400 mt-1 pl-1">You have been invited to join this organization</div>
                )}
              </div>
            </>
          )}

          {(!isRegistering && loginStep === 1) && (
            <div className="su-field relative">
              <input
                type="text"
                placeholder="Workspace / Organization Name"
                value={orgName}
                onChange={(e) => {
                  setOrgName(e.target.value);
                  if (errorMessage) setErrorMessage('');
                }}
                required
                readOnly={isInvite}
                style={isInvite ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
              />
              {isInvite && (
                <div className="text-xs text-indigo-400 mt-1 pl-1">You have been invited to join this organization</div>
              )}
            </div>
          )}

          {(isRegistering || (!isRegistering && loginStep === 2)) && (
            <>
              <div className="su-field">
                <input
                  type="text"
                  placeholder="Email address"
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  autoComplete="username"
                  required
                />
              </div>

              <div className="su-field password">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="su-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-[18px] h-[18px]" />
                  ) : (
                    <Eye className="w-[18px] h-[18px]" />
                  )}
                </button>
              </div>

              {/* Remember me & Forgot Password */}
              {!isRegistering && (
                <div className="su-row">
                  <div
                    className="su-remember"
                    onClick={() => setRememberMe(!rememberMe)}
                    role="checkbox"
                    aria-checked={rememberMe}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        setRememberMe(!rememberMe);
                      }
                    }}
                  >
                    <div className={`su-checkbox-box ${rememberMe ? 'checked' : 'unchecked'}`}>
                      {rememberMe && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span className="su-remember-text">Remember me</span>
                  </div>

                  <button
                    type="button"
                    className="su-forgot-btn"
                    onClick={() => toast.info('Please contact your administrator for password recovery.')}
                  >
                    Forgot password?
                  </button>
                </div>
              )}
            </>
          )}

          <div style={{ width: '100%', marginTop: isRegistering ? '12px' : '0' }}></div>

          {/* Sign In Button with Gloss Satin Lime Theme & Interactive Bubble Burst */}
          <button
            ref={submitBtnRef}
            type="submit"
            className="su-submit-btn"
            disabled={isLoading}
            onClick={handleButtonClick}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#080d03]" />
                <span>{isRegistering ? 'Creating...' : 'Signing in...'}</span>
              </>
            ) : (
              <>
                <span>
                  {isRegistering 
                    ? 'Create Workspace' 
                    : (!isRegistering && loginStep === 1) 
                      ? 'Continue' 
                      : 'Sign in'}
                </span>
                <ArrowRight className="w-4 h-4 ml-0.5 stroke-[2.4]" />
              </>
            )}
          </button>
          
          <div style={{ marginTop: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '12px' }}>
             {!isRegistering && loginStep === 2 && (
               <button
                 type="button"
                 className="su-forgot-btn"
                 onClick={() => {
                   setLoginStep(1);
                   setErrorMessage('');
                 }}
               >
                 &larr; Back to Workspace
               </button>
             )}
             <button
                type="button"
                className="su-forgot-btn"
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setLoginStep(1);
                  setErrorMessage('');
                }}
              >
                {isRegistering 
                  ? 'Already have an organization? Sign in' 
                  : "Don't have an organization? Register Workspace"}
             </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default LoginPage;
