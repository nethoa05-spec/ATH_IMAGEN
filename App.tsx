
import React, { useState, useEffect } from 'react';
import { StyleType, AspectRatioType, GeneratedImage, Session, UserProfile, UserPlan, SUBSCRIPTION_PLANS } from './types';
import { fileToBase64, cleanFilename } from './services/imageUtils';
import { generateCharacterImage } from './services/geminiService';
import { 
  auth, 
  googleProvider, 
  getUserProfile, 
  createUserProfile, 
  decrementCreditsAndIncrementUsed,
  updateUserPlan 
} from './services/firebase';
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { createPaymentLink } from './services/payosService';

const STYLES: StyleType[] = [
  "Realistic", "Anime", "Cartoon", "Fantasy", "Sci-Fi", 
  "Pixel Art", "3D Render", "Watercolor", "Oil Painting", 
  "Comic Book", "Black & White"
];

const ASPECT_RATIOS: AspectRatioType[] = ["16:9", "1:1", "3:4", "4:3", "9:16"];

const Logo: React.FC<{ className?: string }> = ({ className = "w-10 h-10" }) => (
  <div className={`${className} bg-gradient-to-br from-emerald-600 to-cyan-500 rounded-xl shadow-lg flex items-center justify-center overflow-hidden relative group`}>
    <svg viewBox="0 0 100 100" className="w-full h-full p-2 drop-shadow-md">
      <path 
        d="M30 75L50 25L70 75M38 55H62" 
        stroke="white" 
        strokeWidth="10" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        fill="none" 
      />
      <circle cx="78" cy="22" r="12" fill="white" className="group-hover:animate-pulse" />
      <path 
        d="M78 14V30M70 22H86" 
        stroke="#059669" 
        strokeWidth="4" 
        strokeLinecap="round" 
      />
    </svg>
  </div>
);

const App: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [view, setView] = useState<'auth' | 'app' | 'pricing'>('auth');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  const activeSession = sessions.find(s => s.id === activeId);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        setIsLoadingProfile(true);
        let p = await getUserProfile(u.uid);
        if (!p) {
          p = await createUserProfile(u.uid, u.email);
        }
        setProfile(p);
        
        const urlParams = new URLSearchParams(window.location.search);
        const status = urlParams.get('status');
        const code = urlParams.get('code');
        const cancel = urlParams.get('cancel');

        if (code === '00' || status === 'PAID') {
          const pendingPlanStr = localStorage.getItem('pending_plan');
          if (pendingPlanStr) {
            try {
              const pendingPlan = JSON.parse(pendingPlanStr);
              await updateUserPlan(u.uid, pendingPlan.id, pendingPlan.limit);
              const updatedP = await getUserProfile(u.uid);
              setProfile(updatedP);
              localStorage.removeItem('pending_plan');
              alert(`Chúc mừng! Bạn đã nâng cấp gói thành công.`);
              window.history.replaceState({}, document.title, window.location.pathname);
            } catch (err) {
              console.error("Lỗi cập nhật:", err);
            }
          }
        } else if (cancel === 'true') {
          alert("Giao dịch bị hủy.");
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        setView('app');
        setIsLoadingProfile(false);
      } else {
        setView('auth');
        setIsLoadingProfile(false);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (view === 'app' && sessions.length === 0) {
      createNewSession();
    }
  }, [view]);

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const createNewSession = () => {
    const newId = `session-${Date.now()}`;
    const newSession: Session = {
      id: newId,
      name: `Batch ${sessions.length + 1}`,
      style: "Realistic",
      aspectRatio: "16:9",
      referenceFile: null,
      referencePreview: null,
      scenesText: "",
      results: [],
      isGenerating: false,
      progress: 0,
      total: 0
    };
    setSessions(prev => [...prev, newSession]);
    setActiveId(newId);
  };

  const updateSession = (id: string, updates: Partial<Session>) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleGenerateAll = async (id: string) => {
    const session = sessions.find(s => s.id === id);
    if (!session || !session.referenceFile || session.isGenerating || !profile) return;

    const lines = session.scenesText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return;

    const required = lines.length;
    if (profile.plan === 'free' && profile.credits < required) {
      setGlobalError(`Hết lượt miễn phí. Vui lòng nâng cấp gói.`);
      return;
    }

    if (profile.dailyUsed + required > profile.dailyLimit) {
      setGlobalError(`Đạt giới hạn ngày (${profile.dailyUsed}/${profile.dailyLimit}).`);
      return;
    }

    const timestamp = Date.now();
    const initialResults: GeneratedImage[] = lines.map((desc, idx) => ({
      id: `img-${id}-${timestamp}-${idx}`,
      url: '',
      description: desc,
      status: 'processing'
    }));

    setSessions(prev => prev.map(s => s.id === id ? {
      ...s,
      isGenerating: true,
      progress: 0,
      total: lines.length,
      results: initialResults
    } : s));

    try {
      const { data: base64Ref, mimeType } = await fileToBase64(session.referenceFile);
      
      const CONCURRENCY_LIMIT = 35;
      
      for (let i = 0; i < initialResults.length; i += CONCURRENCY_LIMIT) {
        const batch = initialResults.slice(i, i + CONCURRENCY_LIMIT);
        
        const batchTasks = batch.map(async (res) => {
          try {
            const imageUrl = await generateCharacterImage(
              base64Ref, 
              mimeType, 
              res.description, 
              session.style, 
              session.aspectRatio
            );
            
            await decrementCreditsAndIncrementUsed(profile.uid, profile.plan === 'free');
            
            setSessions(prev => prev.map(s => {
              if (s.id !== id) return s;
              const updatedResults = s.results.map(r => 
                r.id === res.id ? { ...r, url: imageUrl, status: 'completed' as const } : r
              );
              const finished = updatedResults.filter(r => r.status === 'completed' || r.status === 'error').length;
              return { ...s, results: updatedResults, progress: finished };
            }));
          } catch (err: any) {
            console.error(`Error for ${res.id}:`, err);
            if (err.message === "API key not valid") {
              if ((window as any).aistudio) {
                setGlobalError("Cần chọn lại API Key do khóa mặc định bị lỗi.");
                await (window as any).aistudio.openSelectKey();
              }
            }

            setSessions(prev => prev.map(s => {
              if (s.id !== id) return s;
              const updatedResults = s.results.map(r => 
                r.id === res.id ? { ...r, status: 'error' as const, error: err.message || "Failed" } : r
              );
              const finished = updatedResults.filter(r => r.status === 'completed' || r.status === 'error').length;
              return { ...s, results: updatedResults, progress: finished };
            }));
          }
        });

        await Promise.all(batchTasks);
      }
      
      const updatedProfile = await getUserProfile(profile.uid);
      setProfile(updatedProfile);

    } catch (err: any) {
      setGlobalError(`Lỗi: ${err.message}`);
    } finally {
      updateSession(id, { isGenerating: false });
    }
  };

  const handleDownloadZip = async () => {
    if (!activeSession || activeSession.results.length === 0) return;
    const completedImages = activeSession.results.filter(r => r.status === 'completed' && r.url);
    if (completedImages.length === 0) return;

    try {
      const JSZip = (window as any).JSZip;
      const zip = new JSZip();
      completedImages.forEach((res, idx) => {
        const base64Data = res.url.split(',')[1];
        const extension = res.url.split(';')[0].split('/')[1] || 'png';
        const fileName = `${String(idx + 1).padStart(2, '0')}_${cleanFilename(res.description)}.${extension}`;
        zip.file(fileName, base64Data, { base64: true });
      });
      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `cf_${cleanFilename(activeSession.name)}.zip`;
      link.click();
    } catch (err) {
      alert("Lỗi tải file.");
    }
  };

  const handleBuyPlan = async (plan: any) => {
    if (!profile) return;
    try {
      localStorage.setItem('pending_plan', JSON.stringify({
        id: plan.id,
        limit: plan.limit,
        name: plan.name
      }));
      const orderCode = Number(String(Date.now()).slice(-6));
      const checkoutUrl = await createPaymentLink({
        amount: plan.price,
        description: `CF ${plan.name}`,
        orderCode: orderCode,
        returnUrl: window.location.href,
        cancelUrl: window.location.href
      });
      window.location.href = checkoutUrl;
    } catch (err: any) {
      alert("Lỗi: " + err.message);
    }
  };

  if (isLoadingProfile) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (view === 'auth') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-10 rounded-[2.5rem] shadow-2xl">
          <div className="flex flex-col items-center mb-10">
            <Logo className="w-20 h-20 mb-6" />
            <h1 className="text-3xl font-black tracking-tight text-white uppercase text-center">ath imagen</h1>
            <p className="text-slate-500 text-sm mt-2 font-medium">Batch Consistency Engine</p>
          </div>
          <button onClick={handleGoogleLogin} className="w-full py-4 bg-white hover:bg-slate-100 text-slate-900 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all active:scale-95 mb-6">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="" />
            Tiếp tục với Google
          </button>
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800"></div></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-slate-900 px-3 text-slate-500 font-bold">Hoặc</span></div>
          </div>
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <input name="email" type="email" placeholder="Email" required className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-emerald-500" />
            <input name="password" type="password" placeholder="Mật khẩu" required className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-emerald-500" />
            <button className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-emerald-900/20">
              {authMode === 'login' ? 'Đăng Nhập' : 'Đăng Ký'}
            </button>
          </form>
          {authError && <p className="text-red-400 text-xs mt-4 text-center font-bold">{authError}</p>}
          <div className="mt-8 text-center">
            <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-emerald-400 text-sm font-bold hover:underline">
              {authMode === 'login' ? "Tạo tài khoản mới" : "Đã có tài khoản? Đăng nhập"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'pricing') {
    return (
      <div className="min-h-screen bg-slate-950 p-8">
        <div className="max-w-6xl mx-auto">
          <header className="flex justify-between items-center mb-16">
            <button onClick={() => setView('app')} className="flex items-center gap-2 text-slate-400 hover:text-white font-bold transition-colors uppercase text-xs tracking-widest">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
              Quay lại
            </button>
            <h1 className="text-2xl font-black text-white uppercase tracking-widest">Nâng cấp Flash Plan</h1>
            <div className="w-20"></div>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {SUBSCRIPTION_PLANS.map(plan => (
              <div key={plan.id} className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] flex flex-col items-center text-center hover:border-emerald-500 transition-all shadow-xl group">
                <h3 className="text-sm font-black text-slate-500 mb-2 uppercase tracking-widest">{plan.name}</h3>
                <div className="text-2xl font-black text-white mb-6">
                  {plan.price.toLocaleString('vi-VN')} <span className="text-[10px] text-slate-500">VND</span>
                </div>
                <div className="space-y-4 mb-10 flex-1 text-xs font-bold text-slate-400">
                  <p>{plan.limit} Ảnh / Ngày</p>
                  <p>Tốc độ cao nhất</p>
                </div>
                <button onClick={() => handleBuyPlan(plan)} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase transition-all active:scale-95">
                  Chọn gói
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <aside className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Logo className="w-8 h-8" />
              <h1 className="text-lg font-black tracking-tight text-white uppercase">ath imagen</h1>
            </div>
            <button onClick={() => signOut(auth)} className="text-slate-500 hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" /></svg>
            </button>
          </div>
          <div className="bg-slate-950 border border-slate-800 p-5 rounded-2xl mb-8">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] font-black uppercase text-slate-500">Plan: {profile?.plan}</span>
              <button onClick={() => setView('pricing')} className="text-[10px] font-black uppercase text-emerald-400 hover:underline">Nâng cấp</button>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-[10px] font-black">
                <span className="text-slate-500 uppercase">Hôm nay</span>
                <span className="text-white">{profile?.dailyUsed}/{profile?.dailyLimit}</span>
              </div>
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${profile ? (profile.dailyUsed / profile.dailyLimit) * 100 : 0}%` }}></div>
              </div>
            </div>
          </div>
          <button onClick={createNewSession} className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95">
            + New Batch
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {sessions.map(s => (
            <div key={s.id} onClick={() => setActiveId(s.id)} className={`group p-4 rounded-2xl cursor-pointer border transition-all ${activeId === s.id ? 'bg-slate-800 border-emerald-500/50' : 'bg-transparent border-transparent hover:bg-slate-800/40'}`}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold truncate pr-6">{s.name}</span>
                <button onClick={(e) => { e.stopPropagation(); setSessions(sessions.filter(ses => ses.id !== s.id)); }} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
              </div>
              <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
                <div className={`h-full bg-emerald-500 transition-all`} style={{ width: `${s.total ? (s.progress / s.total) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto custom-scrollbar bg-slate-950">
        {activeSession ? (
          <div className="p-8 max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-10">
              <aside className="space-y-6">
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Phong cách</label>
                    <select className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500" value={activeSession.style} onChange={(e) => updateSession(activeSession.id, { style: e.target.value as StyleType })}>
                      {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Tỉ lệ</label>
                    <div className="grid grid-cols-3 gap-2">
                      {ASPECT_RATIOS.map(ratio => (
                        <button key={ratio} onClick={() => updateSession(activeSession.id, { aspectRatio: ratio })} className={`py-2 text-[10px] font-black rounded-lg border transition-all ${activeSession.aspectRatio === ratio ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-500'}`}>
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Gốc nhân vật</label>
                    <div className="aspect-[4/3] rounded-2xl border-2 border-dashed border-slate-800 bg-slate-800/50 cursor-pointer overflow-hidden flex flex-col items-center justify-center hover:border-emerald-500/50 transition-all" onClick={() => document.getElementById(`file-${activeSession.id}`)?.click()}>
                      {activeSession.referencePreview ? <img src={activeSession.referencePreview} className="w-full h-full object-cover" /> : <span className="text-[10px] font-black uppercase text-slate-600">Upload Ref</span>}
                      <input id={`file-${activeSession.id}`} type="file" className="hidden" accept="image/*" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => updateSession(activeSession.id, { referenceFile: file, referencePreview: reader.result as string });
                          reader.readAsDataURL(file);
                        }
                      }} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Mô tả (1 cảnh/dòng)</label>
                    <textarea className="w-full h-40 bg-slate-800 border border-slate-700 rounded-2xl p-4 text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500 resize-none custom-scrollbar" value={activeSession.scenesText} onChange={(e) => updateSession(activeSession.id, { scenesText: e.target.value })} placeholder="Ví dụ: Đang chạy bộ..." />
                  </div>
                  <button onClick={() => handleGenerateAll(activeSession.id)} disabled={activeSession.isGenerating || !activeSession.referenceFile || !activeSession.scenesText.trim()} className={`w-full py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeSession.isGenerating ? 'bg-slate-800 text-slate-600' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg'}`}>
                    {activeSession.isGenerating ? 'ĐANG VẼ...' : 'VẼ BỘ ẢNH'}
                  </button>
                </div>
              </aside>

              <div className="space-y-6">
                {globalError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-xs font-bold flex justify-between items-center">
                    {globalError}
                    <button onClick={() => setGlobalError(null)}>&times;</button>
                  </div>
                )}
                <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] min-h-[500px]">
                  <header className="flex justify-between items-center mb-10">
                    <h2 className="text-xl font-black text-white uppercase tracking-widest">Library</h2>
                    {activeSession.results.some(r => r.status === 'completed') && (
                      <button onClick={handleDownloadZip} className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-[10px] font-black uppercase rounded-lg border border-slate-700">Tải ZIP</button>
                    )}
                  </header>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {activeSession.results.map(res => (
                      <div key={res.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                        <div className={`relative bg-slate-950 flex items-center justify-center ${activeSession.aspectRatio === '9:16' ? 'aspect-[9/16]' : (activeSession.aspectRatio === '16:9' ? 'aspect-[16/9]' : 'aspect-square')}`}>
                          {res.url ? <img src={res.url} className="w-full h-full object-cover" /> : <div className="text-[10px] font-black uppercase text-slate-700">{res.status}...</div>}
                        </div>
                        <div className="p-3">
                          <p className="text-[10px] text-slate-500 font-bold truncate">"{res.description}"</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-[10px] font-black uppercase text-slate-800 tracking-[0.5em]">ath imagen FLASH</div>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
