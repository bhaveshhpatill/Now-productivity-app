/*
=============================================================================
SUPABASE INTEGRATION SCHEMA (Run this in your Supabase SQL Editor)
=============================================================================

-- 1. Create Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  pin_hash TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create App Data table (JSON storage for simplicity/portability)
CREATE TABLE IF NOT EXISTS user_data (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  tasks JSONB DEFAULT '[]',
  reminders JSONB DEFAULT '[]',
  notes JSONB DEFAULT '[]',
  checkins JSONB DEFAULT '[]',
  reflections JSONB DEFAULT '[]',
  streak JSONB DEFAULT '{"current":0,"lastDate":null}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can view own data" ON user_data FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own data" ON user_data FOR ALL USING (auth.uid() = user_id);
=============================================================================
*/

console.log("APP JS LOADED");

let supabaseInstance;
try {
    if (!window.supabase) {
        throw new Error("Supabase CDN not loaded");
    }

    const SUPABASE_URL = "https://unucqhtoegwylmwsrnrt.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_QnqXD-mlp83KAmLg3b73Jg_XiZIryX2";

    const { createClient } = window.supabase;
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabaseClient = supabaseInstance;

    console.log("✅ Supabase initialized");
} catch (err) {
    console.error("❌ SUPABASE INIT FAILED:", err);
}


        // --- Global Interaction System ---
        const InteractionSystem = {
            init() {
                document.addEventListener('click', (e) => {
                    this.createRipple(e.clientX, e.clientY);
                    if (e.target.closest('button') || e.target.closest('.numpad-btn') || e.target.closest('.checkbox')) {
                        this.createParticles(e.clientX, e.clientY);
                    }
                });
            },
            createRipple(x, y) {
                const ripple = document.createElement('div');
                ripple.className = 'g-ripple';
                const size = 100;
                ripple.style.width = ripple.style.height = `${size}px`;
                ripple.style.left = `${x - size / 2}px`;
                ripple.style.top = `${y - size / 2}px`;
                document.body.appendChild(ripple);
                ripple.onanimationend = () => ripple.remove();
            },
            createParticles(x, y) {
                const colors = ['#6366f1', '#a855f7', '#818cf8', '#c084fc'];
                for (let i = 0; i < 8; i++) {
                    const particle = document.createElement('div');
                    particle.className = 'particle';
                    const size = Math.random() * 6 + 4;
                    particle.style.width = particle.style.height = `${size}px`;
                    particle.style.background = colors[Math.floor(Math.random() * colors.length)];
                    particle.style.left = `${x}px`;
                    particle.style.top = `${y}px`;
                    
                    const angle = Math.random() * Math.PI * 2;
                    const velocity = Math.random() * 60 + 40;
                    const dx = Math.cos(angle) * velocity;
                    const dy = Math.sin(angle) * velocity;
                    
                    particle.style.setProperty('--dx', `${dx}px`);
                    particle.style.setProperty('--dy', `${dy}px`);
                    
                    document.body.appendChild(particle);
                    particle.onanimationend = () => particle.remove();
                }
            }
        };
        InteractionSystem.init();

        // --- Auth Storage Helpers ---
        function getUser() { return localStorage.getItem("now_user"); }
        function setUser(user) { localStorage.setItem("now_user", user); }
        function getPinHash() { return localStorage.getItem("now_pinHash"); }
        function setPinHash(hash) { localStorage.setItem("now_pinHash", hash); }

        async function hashPin(pin) {
            const msgBuffer = new TextEncoder().encode(pin);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        // --- State Management ---
        const state = {
            tasks: JSON.parse(localStorage.getItem('now_tasks') || '[]'),
            reminders: JSON.parse(localStorage.getItem('now_reminders') || '[]'),
            notes: JSON.parse(localStorage.getItem('now_notes') || '[]'),
            checkins: JSON.parse(localStorage.getItem('now_checkins') || '[]'),
            reflections: JSON.parse(localStorage.getItem('now_reflections') || '[]'),
            streak: JSON.parse(localStorage.getItem('now_streak') || '{"current":0,"lastDate":null}')
        };

        let isSyncing = false;
        const setSyncStatus = (status) => {
            const indicator = document.getElementById('sync-indicator');
            if (indicator) {
                indicator.textContent = status === 'syncing' ? '🔄' : status === 'done' ? '✅' : '❌';
                indicator.title = status === 'syncing' ? 'Syncing with Supabase...' : status === 'done' ? 'Synced' : 'Sync Failed';
            }
        };

        const saveState = async (key, value) => {
            state[key] = value;
            localStorage.setItem(`now_${key}`, JSON.stringify(value));
            
            // Push to Supabase if available
            if (supabaseInstance && !isSyncing) {
                syncToSupabase();
            }
        };

        const syncToSupabase = async () => {
            try {
                const { data: { user } } = await supabaseInstance.auth.getUser();
                if (!user) return;

                isSyncing = true;
                setSyncStatus('syncing');

                const { error } = await supabaseInstance
                    .from('user_data')
                    .upsert({
                        user_id: user.id,
                        tasks: state.tasks,
                        reminders: state.reminders,
                        notes: state.notes,
                        checkins: state.checkins,
                        reflections: state.reflections,
                        streak: state.streak,
                        updated_at: new Date().toISOString()
                    });

                if (error) throw error;
                setSyncStatus('done');
            } catch (err) {
                console.error("Supabase Sync Error:", err);
                setSyncStatus('error');
            } finally {
                isSyncing = false;
            }
        };

        const loadStateFromSupabase = async () => {
            try {
                const { data: { user } } = await supabaseInstance.auth.getUser();
                if (!user) return;

                setSyncStatus('syncing');
                const { data, error } = await supabaseInstance
                    .from('user_data')
                    .select('*')
                    .eq('user_id', user.id)
                    .single();

                if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "not found"

                if (data) {
                    // Merge Supabase data into state and localStorage
                    const keys = ['tasks', 'reminders', 'notes', 'checkins', 'reflections', 'streak'];
                    keys.forEach(key => {
                        if (data[key]) {
                            state[key] = data[key];
                            localStorage.setItem(`now_${key}`, JSON.stringify(data[key]));
                        }
                    });
                    console.log("✅ Data loaded from Supabase");
                    setSyncStatus('done');
                }
            } catch (err) {
                console.error("Supabase Load Error:", err);
                setSyncStatus('error');
            }
        };

        const getTodayStr = () => new Date().toISOString().split('T')[0];

        // --- Screen Management ---
        const screens = document.querySelectorAll('.screen');
        const bottomNav = document.getElementById('bottom-nav');
        const fab = document.getElementById('fab-add');
        
        let currentScreen = '';

        const showScreen = (screenId) => {
            const oldScreen = currentScreen;
            currentScreen = screenId;
            
            // Fade out current screen if exists
            if (oldScreen && oldScreen !== screenId) {
                const oldEl = document.getElementById(oldScreen);
                if (oldEl) {
                    oldEl.style.opacity = '0';
                    oldEl.style.transform = 'scale(0.96) translateY(10px)';
                    setTimeout(() => oldEl.classList.add('hidden'), 400);
                }
            }

            const target = document.getElementById(screenId);
            if(target) {
                target.classList.remove('hidden');
                // Force reflow
                target.offsetHeight;
                target.style.opacity = '1';
                target.style.transform = 'scale(1) translateY(0)';
                target.scrollTop = 0;
            }
            
            const navVisible = ['screen-main', 'screen-tasks', 'screen-reminders', 'screen-notes', 'screen-focus-tools'].includes(screenId);
            if(navVisible) {
                bottomNav.classList.remove('hidden');
                fab.classList.remove('hidden');
                document.querySelectorAll('.nav-item').forEach(nav => {
                    nav.classList.toggle('active', nav.dataset.target === screenId);
                });
            } else {
                bottomNav.classList.add('hidden');
                fab.classList.add('hidden');
            }

            if(screenId === 'screen-main') renderMain();
            if(screenId === 'screen-tasks') renderTasks();
            if(screenId === 'screen-reminders') renderReminders();
            if(screenId === 'screen-notes') renderNotes();
            if(screenId === 'screen-focus-tools') {
                if (!document.getElementById('quick-reset-text').textContent) {
                    getNextQuickReset();
                }
            }
        };

        document.querySelectorAll('.nav-item').forEach(nav => {
            nav.addEventListener('click', () => showScreen(nav.dataset.target));
        });

        document.getElementById('btn-login').addEventListener('click', async () => {
            const user = document.getElementById('login-username').value.trim();
            if (user) {
                setUser(user);
                
                // If we have supabase, try to sign in or sign up
                if (supabaseInstance) {
                    const email = `${user.toLowerCase()}@now.app`;
                    const tempPass = "dummy_pass_123"; // We will update with real PIN later
                    
                    try {
                        // Just check if user exists or not
                        const { data, error } = await supabaseInstance.auth.signInWithPassword({
                            email: email,
                            password: tempPass,
                        });
                        
                        // We don't actually sign in here because we don't have the PIN yet.
                        // We just store the username and move to PIN screen.
                    } catch (e) {}
                }

                if (getPinHash()) {
                    showScreen('screen-pin-entry');
                } else {
                    showScreen('screen-pin-setup');
                }
            } else {
                alert("Please enter a valid username");
            }
        });

        // Allow Enter key on login
        document.getElementById('login-username').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('btn-login').click();
        });

        // --- PIN Logic ---
        let pinBuffer = '';

        const handleNumpad = async (val, mode) => {
            if (val === 'del') {
                pinBuffer = pinBuffer.slice(0, -1);
            } else if (pinBuffer.length < 4) {
                pinBuffer += val;
            }

            const dots = document.getElementById(`${mode}-dots`).children;
            for (let i = 0; i < 4; i++) {
                if (i < pinBuffer.length) dots[i].classList.add('filled');
                else dots[i].classList.remove('filled');
            }

            if (pinBuffer.length === 4) {
                const hash = await hashPin(pinBuffer);
                const username = getUser();
                const email = `${username.toLowerCase()}@now.app`;
                const password = `pin_${pinBuffer}`; // Use pin as password for Supabase Auth

                if (mode === 'setup') {
                    setPinHash(hash);
                    
                    if (supabaseInstance) {
                        try {
                            setSyncStatus('syncing');
                            // 1. Sign Up
                            const { data: authData, error: signUpError } = await supabaseInstance.auth.signUp({
                                email,
                                password,
                                options: { data: { username } }
                            });
                            
                            if (signUpError) throw signUpError;

                            // 2. Initialize profiles and user_data
                            if (authData.user) {
                                // Insert profile
                                await supabaseInstance.from('profiles').insert({
                                    id: authData.user.id,
                                    username: username,
                                    pin_hash: hash
                                });

                                // Insert app data
                                await supabaseInstance.from('user_data').insert({
                                    user_id: authData.user.id,
                                    tasks: state.tasks,
                                    reminders: state.reminders,
                                    notes: state.notes,
                                    checkins: state.checkins,
                                    reflections: state.reflections,
                                    streak: state.streak
                                });
                            }
                            setSyncStatus('done');
                        } catch (err) {
                            console.error("Supabase Setup Error:", err);
                            setSyncStatus('error');
                        }
                    }

                    pinBuffer = '';
                    checkCheckin();
                }

                if (mode === 'entry') {
                    const storedHash = getPinHash();
                    if (hash === storedHash) {
                        
                        if (supabaseInstance) {
                            try {
                                setSyncStatus('syncing');
                                const { error: signInError } = await supabaseInstance.auth.signInWithPassword({
                                    email,
                                    password
                                });
                                if (signInError) throw signInError;
                                
                                // Load fresh data from cloud
                                await loadStateFromSupabase();
                                setSyncStatus('done');
                            } catch (err) {
                                console.error("Supabase SignIn Error:", err);
                                setSyncStatus('error');
                                // Continue anyway with local data if sign-in fails but PIN is correct locally
                            }
                        }

                        pinBuffer = '';
                        checkCheckin();
                    } else {
                        const dotsContainer = document.getElementById('entry-dots');
                        dotsContainer.classList.add('shake');
                        setTimeout(() => {
                            dotsContainer.classList.remove('shake');
                            pinBuffer = '';
                            for (let i = 0; i < 4; i++) dots[i].classList.remove('filled');
                        }, 400);
                    }
                }
            }
        };

        // --- NUMPAD EVENTS ---
        document.querySelectorAll('#setup-numpad .numpad-btn').forEach(btn => {
            if (btn.dataset.val) btn.addEventListener('click', () => handleNumpad(btn.dataset.val, 'setup'));
        });

        document.querySelectorAll('#entry-numpad .numpad-btn').forEach(btn => {
            if (btn.dataset.val) btn.addEventListener('click', () => handleNumpad(btn.dataset.val, 'entry'));
        });

        const checkCheckin = () => {
            const today = getTodayStr();
            const doneToday = state.checkins.some(c => c.date === today);
            if (!doneToday) {
                checkinStep = 0;
                checkinAnswers = {};
                showScreen('screen-checkin');
                renderCheckinStep();
            } else {
                showScreen('screen-main');
                // FIX: Delay advice overlay so the main screen renders first
                setTimeout(() => {
                    showDailyAdvice();
                    checkEveningReflection();
                }, 300);
            }
        };

        // --- Daily Check-in ---
        const checkinQuestions = [
            { id: 'energy', q: "Before we dive in — how's your battery right now?", opts: [{t:"🔋 Fully charged", v:"high"}, {t:"⚡ Good enough", v:"medium"}, {t:"🪫 Running low", v:"low"}, {t:"☕ Need to refuel", v:"very_low"}] },
            { id: 'environment', q: "What's the space around you like?", opts: [{t:"🔇 Quiet, all to myself", v:"great"}, {t:"🔊 Bit noisy but okay", v:"okay"}, {t:"🌪️ Pretty chaotic", v:"bad"}, {t:"📍 On the move", v:"mobile"}] },
            { id: 'yesterday', q: "Yesterday — did things go roughly as planned?", opts: [{t:"✅ Mostly yes", v:"good"}, {t:"🔄 Hit and miss", v:"mixed"}, {t:"🌊 Got swept away", v:"bad"}, {t:"📋 Didn't really plan", v:"none"}] },
            { id: 'mode', q: "What kind of mode are you in today?", opts: [{t:"🚀 Ready to push", v:"high"}, {t:"🐢 Slow and deliberate", v:"steady"}, {t:"🌊 Just going with it", v:"flow"}, {t:"🛡️ Trying to hold it together", v:"survival"}] },
            { id: 'blocker', q: "Is anything pulling your attention right now?", opts: [{t:"🧘 Nope, I'm clear", v:"clear"}, {t:"💭 Something on my mind", v:"thoughts"}, {t:"📱 Phone keeps calling", v:"phone"}, {t:"👥 People around me", v:"people"}] }
        ];
        
        let checkinStep = 0;
        let checkinAnswers = {};

        const renderCheckinStep = () => {
            const q = checkinQuestions[checkinStep];
            const container = document.getElementById('checkin-container');
            container.innerHTML = `<h2 class="mb-24">${q.q}</h2>` + 
                q.opts.map(o => `<button class="big-tap checkin-opt" data-val="${o.v}">${o.t}</button>`).join('');
            
            const dots = document.getElementById('checkin-progress').children;
            for(let i=0; i<5; i++) {
                dots[i].className = 'progress-dot' + (i === checkinStep ? ' active' : '');
            }

            document.querySelectorAll('.checkin-opt').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    checkinAnswers[q.id] = e.target.dataset.val;
                    if(checkinStep < 4) {
                        checkinStep++;
                        setTimeout(renderCheckinStep, 300);
                    } else {
                        checkinAnswers.date = getTodayStr();
                        const newCheckins = [...state.checkins.filter(c => c.date !== getTodayStr()), checkinAnswers];
                        saveState('checkins', newCheckins);
                        showScreen('screen-main');
                        // FIX: Delay advice overlay after checkin completion too
                        setTimeout(() => {
                            showDailyAdvice();
                            checkEveningReflection();
                        }, 300);
                    }
                });
            });
        };

        // --- Smart Task Selection Logic ---
        let currentSuggestedTaskIndex = 0;
        
        const getNowTasks = () => {
            const incomplete = state.tasks.filter(t => !t.done);
            if(incomplete.length === 0) return [];
            
            const todayCheckin = state.checkins.find(c => c.date === getTodayStr()) || {};
            let selectedTasks = [...incomplete];
            let contextMsg = "Here's what makes the most sense right now.";

            if(todayCheckin.energy === 'very_low' || todayCheckin.mode === 'survival') {
                selectedTasks.sort((a, b) => a.estimatedMins - b.estimatedMins);
                contextMsg = "You're running on low today. Picked the quickest thing. Just start there.";
            } else if(todayCheckin.energy === 'low' && todayCheckin.environment === 'bad') {
                const shortTasks = selectedTasks.filter(t => t.estimatedMins <= 20);
                if(shortTasks.length > 0) selectedTasks = shortTasks;
                selectedTasks.sort((a, b) => a.estimatedMins - b.estimatedMins);
                contextMsg = "Tough conditions. One small thing, then reassess.";
            } else if(todayCheckin.blocker === 'thoughts') {
                selectedTasks.sort((a, b) => new Date(a.deadline || '2099') - new Date(b.deadline || '2099'));
                contextMsg = "Something's on your mind — that's okay. Try 10 minutes on this, then check in with yourself.";
            } else if(todayCheckin.blocker === 'phone') {
                selectedTasks.sort((a, b) => new Date(a.deadline || '2099') - new Date(b.deadline || '2099'));
                contextMsg = "Phone's pulling at you. Pop it face-down. 25 minutes. You've got it.";
            } else if(todayCheckin.energy === 'high' && todayCheckin.mode === 'high') {
                selectedTasks.sort((a, b) => new Date(a.deadline || '2099') - new Date(b.deadline || '2099'));
                contextMsg = "You're in a good spot right now. Make it count.";
            } else if(todayCheckin.environment === 'mobile') {
                const shortTasks = selectedTasks.filter(t => t.estimatedMins <= 30);
                if(shortTasks.length > 0) selectedTasks = shortTasks;
                contextMsg = "On the move — picked something you can handle anywhere.";
            } else if(todayCheckin.yesterday === 'bad') {
                selectedTasks.sort((a, b) => a.estimatedMins - b.estimatedMins);
                contextMsg = "Yesterday was rough. Today just needs one win. Start here.";
            } else {
                selectedTasks.sort((a, b) => new Date(a.deadline || '2099') - new Date(b.deadline || '2099'));
            }

            return selectedTasks.map(t => ({...t, contextMsg}));
        };

        // --- Rendering ---
        const renderMain = () => {
            const today = getTodayStr();
            if(state.streak.lastDate && state.streak.lastDate !== today) {
                const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
                if(state.streak.lastDate !== yesterday.toISOString().split('T')[0]) {
                    saveState('streak', { current: 0, lastDate: null });
                }
            }
            document.getElementById('streak-display').textContent = `🔥 ${state.streak.current}`;

            const nowTasks = getNowTasks();
            const card = document.getElementById('main-task-card');
            
            // Add a small fade-in animation for the suggestion card
            card.style.opacity = '0';
            card.style.transform = 'translateY(10px)';
            
            setTimeout(() => {
                if(nowTasks.length > 0) {
                    if(currentSuggestedTaskIndex >= nowTasks.length) currentSuggestedTaskIndex = 0;
                    const task = nowTasks[currentSuggestedTaskIndex];
                    card.innerHTML = `
                        <p class="small mb-12" style="opacity:0.9;color:white;font-weight:500;">${task.contextMsg}</p>
                        <h2 class="mb-20 font-serif" style="color:white;font-size:28px;">${task.name}</h2>
                        <div class="flex gap-12 mb-28">
                            ${task.subject ? `<span class="badge" style="background:rgba(255,255,255,0.25);color:white;backdrop-filter:blur(4px);">${task.subject}</span>` : ''}
                            <span class="badge" style="background:rgba(255,255,255,0.25);color:white;backdrop-filter:blur(4px);">~${task.estimatedMins}m</span>
                        </div>
                        <button class="white mb-16" onclick="startFocus('${task.id}')" style="color:var(--accent);font-weight:700;">Start focus session</button>
                        ${nowTasks.length > 1 ? `<button class="text small" onclick="cycleTask()" style="width:auto;margin:0 auto;min-height:auto;color:rgba(255,255,255,0.9);font-weight:500;">Show me something else</button>` : ''}
                    `;
                } else {
                    card.innerHTML = `
                        <div class="flex-col items-center py-8">
                            <div style="font-size:40px;margin-bottom:16px;">✨</div>
                            <p class="text-center mb-12" style="color:white;font-weight:600;font-size:18px;">All clear for now</p>
                            <p class="small text-center" style="color:white;opacity: 0.8;max-width:240px;">"The secret of getting ahead is getting started."</p>
                        </div>
                    `;
                }
                card.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, 100);

            const tasksList = document.getElementById('main-tasks-list');
            const incomplete = state.tasks.filter(t => !t.done).sort((a,b) => new Date(a.deadline||'2099') - new Date(b.deadline||'2099'));
            tasksList.innerHTML = incomplete.map(t => `
                <div class="task-row ${currentFocusTaskId === t.id && isFocusActive ? 'active-focus' : ''}" style="${currentFocusTaskId === t.id && isFocusActive ? 'border-color: var(--accent);' : ''}">
                    <div class="checkbox" onclick="toggleTask('${t.id}', this.parentElement)"></div>
                    <div style="flex-grow:1; overflow:hidden;">
                        <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${t.name}</div>
                        ${t.deadline ? `<div class="small mt-4" style="color:var(--text-muted);">Due: ${t.deadline}</div>` : ''}
                    </div>
                </div>
            `).join('') || `<p class="text-center text-muted">No tasks yet. Tap + to add one.</p>`;

            const rems = state.reminders.filter(r => !r.notified).sort((a,b) => (a.time || '99:99').localeCompare(b.time || '99:99')).slice(0,3);
            const remsList = document.getElementById('main-reminders-list');
            remsList.innerHTML = rems.map(r => `
                <div class="reminder-chip" onclick="dismissReminder('${r.id}')">${r.emoji} ${r.text} ${r.time ? `· ${r.time}` : ''}</div>
            `).join('');
            if(rems.length === 0) remsList.innerHTML = `<div class="small text-muted">No upcoming reminders</div>`;
            
            if (window.innerWidth >= 900) {
                const rightPanel = document.getElementById('main-right-panel');
                rightPanel.innerHTML = `
                    <div class="flex justify-between items-center mb-16">
                        <h1>Notes Vault</h1>
                        <button class="pill-btn active" id="btn-new-note-desktop" style="width:auto; min-height:auto;">+ New</button>
                    </div>
                    <input type="text" id="notes-search-input-desktop" placeholder="Search notes..." autocomplete="off" style="margin-bottom: 24px;">
                    <div id="notes-list-desktop" class="flex-col gap-12"></div>
                `;
                document.getElementById('btn-new-note-desktop').addEventListener('click', createNewNote);
                document.getElementById('notes-search-input-desktop').addEventListener('input', (e) => {
                    currentNoteSearchQuery = e.target.value;
                    renderNotesList('notes-list-desktop');
                });
                renderNotesList('notes-list-desktop');
            }
        };

        window.cycleTask = () => {
            currentSuggestedTaskIndex++;
            renderMain();
        };

        const renderTasks = () => {
            const list = document.getElementById('tasks-list');
            const sorted = [...state.tasks].sort((a,b) => {
                if(a.done !== b.done) return a.done ? 1 : -1;
                return new Date(a.deadline||'2099') - new Date(b.deadline||'2099');
            });
            
            if(sorted.length === 0) {
                list.innerHTML = `<p class="text-center text-muted mt-24">No tasks yet. Add one with +.</p>`;
                return;
            }

            list.innerHTML = sorted.map(t => `
                <div class="task-row ${t.done ? 'done' : ''}">
                    <div class="checkbox ${t.done ? 'checked' : ''}" onclick="toggleTask('${t.id}', this.parentElement)"></div>
                    <div style="flex-grow:1; overflow:hidden;">
                        <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${t.name}</div>
                        <div class="flex gap-8 mt-4">
                            ${t.subject ? `<span class="badge">${t.subject}</span>` : ''}
                            ${t.deadline ? `<span class="badge" style="background:var(--warn-bg);color:var(--warn);">${t.deadline}</span>` : ''}
                            <span class="badge text-muted" style="background:transparent;border:1px solid rgba(0,0,0,0.1);">~${t.estimatedMins}m</span>
                        </div>
                    </div>
                    <button class="icon-btn" onclick="confirmDeleteTask('${t.id}', this)">🗑️</button>
                </div>
            `).join('');
        };

        const renderReminders = () => {
            const list = document.getElementById('reminders-list');
            const sortedRems = [...state.reminders].sort((a,b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
            if(sortedRems.length === 0) {
                list.innerHTML = `<p class="text-center text-muted mt-24">No reminders active.</p>`;
                return;
            }
            list.innerHTML = sortedRems.map(r => `
                <div class="task-row ${r.notified ? 'done' : ''}">
                    <div style="font-size:24px;">${r.emoji}</div>
                    <div style="flex-grow:1;">
                        <div>${r.text}</div>
                        ${r.time ? `<div class="small text-muted mt-4">🔔 ${r.time}</div>` : ''}
                    </div>
                    <button class="icon-btn" onclick="confirmDeleteReminder('${r.id}', this)">🗑️</button>
                </div>
            `).join('');
        };

        // --- Task Actions ---
        window.toggleTask = (id, el) => {
            const task = state.tasks.find(t => t.id === id);
            if(task) {
                task.done = !task.done;
                task.doneAt = task.done ? new Date().toISOString() : null;
                saveState('tasks', state.tasks);
                
                if(task.done) {
                    if (el) el.classList.add('feedback-pop');
                    const today = getTodayStr();
                    if(state.streak.lastDate !== today) {
                        saveState('streak', { current: state.streak.current + 1, lastDate: today });
                    }
                    showNudge();
                }
                
                if(currentScreen === 'screen-main') renderMain();
                if(currentScreen === 'screen-tasks') renderTasks();
            }
        };

        window.confirmDeleteTask = (id, btn) => {
            const og = btn.innerHTML;
            btn.innerHTML = 'Sure?';
            btn.style.width = 'auto';
            btn.style.color = 'var(--danger)';
            btn.onclick = () => {
                saveState('tasks', state.tasks.filter(t => t.id !== id));
                renderTasks();
                if(currentScreen === 'screen-main') renderMain();
            };
            setTimeout(() => {
                if(document.body.contains(btn)) {
                    btn.innerHTML = og;
                    btn.style.color = '';
                    btn.onclick = () => confirmDeleteTask(id, btn);
                }
            }, 3000);
        };

        window.dismissReminder = (id) => {
            const rem = state.reminders.find(r => r.id === id);
            if(rem) {
                rem.notified = true;
                saveState('reminders', state.reminders);
                renderMain();
            }
        };

        window.confirmDeleteReminder = (id, btn) => {
            const og = btn.innerHTML;
            btn.innerHTML = 'Sure?';
            btn.style.width = 'auto';
            btn.style.color = 'var(--danger)';
            btn.onclick = () => {
                saveState('reminders', state.reminders.filter(r => r.id !== id));
                renderReminders();
                if(currentScreen === 'screen-main') renderMain();
            };
            setTimeout(() => {
                if(document.body.contains(btn)) {
                    btn.innerHTML = og;
                    btn.style.color = '';
                    btn.onclick = () => confirmDeleteReminder(id, btn);
                }
            }, 3000);
        };

        window.quickAddReminder = (text, emoji) => {
            const newRem = { id: 'r_' + Date.now(), emoji, text, time: '', notified: false };
            saveState('reminders', [newRem, ...state.reminders]);
            renderReminders();
            if(currentScreen === 'screen-main') renderMain();
        };

        // --- Notes Logic ---
        let currentNoteSearchQuery = '';

        const createNewNote = () => {
            const newNote = {
                id: 'n_' + Date.now(),
                title: 'Untitled Note',
                content: '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            saveState('notes', [newNote, ...state.notes]);
            if(currentScreen === 'screen-notes') renderNotes();
            if(currentScreen === 'screen-main') renderMain();
        };

        document.getElementById('btn-new-note').addEventListener('click', createNewNote);
        document.getElementById('notes-search-input').addEventListener('input', (e) => {
            currentNoteSearchQuery = e.target.value;
            renderNotes();
        });

        const renderNotesList = (containerId) => {
            const list = document.getElementById(containerId);
            if(!list) return;
            
            let displayNotes = [...state.notes];
            
            if (currentNoteSearchQuery.trim()) {
                const query = currentNoteSearchQuery.toLowerCase();
                displayNotes = displayNotes.filter(n => 
                    (n.title && n.title.toLowerCase().includes(query)) || 
                    (n.content && n.content.toLowerCase().includes(query))
                );
            }

            displayNotes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            
            if(displayNotes.length === 0) {
                list.innerHTML = `<p class="text-center text-muted mt-24">${state.notes.length === 0 ? 'No notes yet. Start dumping.' : 'No notes match your search.'}</p>`;
                return;
            }

            list.innerHTML = displayNotes.map(n => `
                <div class="card" style="padding: 16px;">
                    <div class="flex justify-between items-center mb-8">
                        <input type="text" class="note-title-input" value="${n.title.replace(/"/g, '&quot;')}" data-id="${n.id}" placeholder="Note Title" style="border:none;padding:0;font-weight:600;font-size:15px;background:transparent;">
                        <button class="icon-btn" onclick="confirmDeleteNote('${n.id}', this)">🗑️</button>
                    </div>
                    <textarea class="note-content" data-id="${n.id}" placeholder="Type or paste anything here..." style="border:none;padding:0;background:transparent;min-height:80px;resize:none;">${n.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                    <div class="small text-muted text-right mt-8">Updated: ${new Date(n.updatedAt).toLocaleDateString()}</div>
                </div>
            `).join('');

            list.querySelectorAll('.note-title-input').forEach(input => {
                input.addEventListener('input', (e) => updateNote(e.target.dataset.id, 'title', e.target.value));
            });
            list.querySelectorAll('.note-content').forEach(textarea => {
                textarea.addEventListener('input', (e) => updateNote(e.target.dataset.id, 'content', e.target.value));
            });
        };

        const renderNotes = () => renderNotesList('notes-list');

        const updateNote = (id, field, value) => {
            const note = state.notes.find(n => n.id === id);
            if(note) {
                note[field] = value;
                note.updatedAt = new Date().toISOString();
                saveState('notes', state.notes);
            }
        };

        window.confirmDeleteNote = (id, btn) => {
            const og = btn.innerHTML;
            btn.innerHTML = 'Sure?';
            btn.style.width = 'auto';
            btn.style.color = 'var(--danger)';
            btn.onclick = () => {
                saveState('notes', state.notes.filter(n => n.id !== id));
                if(currentScreen === 'screen-notes') renderNotes();
                if(currentScreen === 'screen-main') renderMain();
            };
            setTimeout(() => {
                if(document.body.contains(btn)) {
                    btn.innerHTML = og;
                    btn.style.color = '';
                    btn.onclick = () => confirmDeleteNote(id, btn);
                }
            }, 3000);
        };

        // --- Mental Advice Messages ---
        const mentalAdviceMessages = [
            "You don't have to figure everything out right now—just being here is enough.",
            "Take a slow breath… nothing else needs your attention in this moment.",
            "You are allowed to pause, even if the world feels like it's rushing.",
            "This moment may feel heavy, but it is not permanent.",
            "You're safe to take things one step at a time, without pressure.",
            "Even now, your body is trying to protect you, not harm you.",
            "It's okay to sit with yourself quietly, without fixing anything.",
            "You can soften your shoulders, unclench your jaw, and just breathe.",
            "There is no urgency in healing—you can move gently.",
            "You don't need to carry everything at once.",
            "Rest is not something you earn, it's something you need.",
            "You can begin again, as many times as it takes.",
            "You are not in danger, even if your thoughts feel loud.",
            "It's okay to feel this without understanding it fully.",
            "Your breath can always bring you back to the present.",
            "You are allowed to take up space, even in your quiet moments.",
            "Nothing about this moment defines your entire life.",
            "You can let things be unfinished for now.",
            "You don't need to rush your way out of this feeling.",
            "Even small moments of calm count.",
            "You are still here, and that matters.",
            "You can be gentle with yourself today.",
            "There is no right way to feel right now.",
            "You don't have to hold everything together perfectly.",
            "You are allowed to just exist for a while.",
            "Your thoughts may be loud, but they are not always true.",
            "You don't have to follow every thought your mind creates.",
            "It's okay to let a thought pass without holding onto it.",
            "Not everything your mind says deserves your energy.",
            "You can notice a thought and still choose peace.",
            "You are not your thoughts—you are the one observing them.",
            "It's okay if your mind wanders; gently bring it back.",
            "You don't need to solve every 'what if' right now.",
            "Some thoughts are just noise, not signals.",
            "You can choose which thoughts to give meaning to.",
            "You are allowed to rest your mind.",
            "Let your thoughts come and go like passing clouds.",
            "You don't need certainty to feel calm.",
            "Your thoughts don't control your actions—you do.",
            "You are worthy, even on days when you feel unsure.",
            "You don't need to prove your value to exist.",
            "You are allowed to be imperfect and still be enough.",
            "The way you speak to yourself matters—try softness.",
            "You deserve the same kindness you give others.",
            "You are not defined by your worst moments.",
            "Growth takes time, and you are already on your way.",
            "You are doing better than you think you are.",
            "It's okay to be a work in progress.",
            "You are allowed to forgive yourself slowly.",
            "You don't have to be strong all the time.",
            "You are still worthy, even when you feel tired.",
            "Your effort matters, even if it's unseen.",
            "You are not behind—you are on your own timeline.",
            "You deserve peace, not constant pressure.",
            "You are enough, even without achieving anything today.",
            "Some days are heavier, and that's part of being human.",
            "You don't have to be okay all the time.",
            "Healing is not linear—it has quiet days too.",
            "This feeling will shift, even if slowly.",
            "You've made it through hard moments before.",
            "You don't need to rush your healing.",
            "You are not alone in feeling this way.",
            "Even difficult days have small moments of relief.",
            "You are allowed to start again tomorrow.",
            "You are stronger than you feel right now.",
            "You can keep going, gently.",
            "There is still space for hope, even now.",
            "You will be okay, even if it doesn't feel like it yet."
        ];

        const getNextQuickReset = () => {
            const currentText = document.getElementById('quick-reset-text').textContent;
            let nextMsg;
            do {
                nextMsg = mentalAdviceMessages[Math.floor(Math.random() * mentalAdviceMessages.length)];
            } while (nextMsg === currentText && mentalAdviceMessages.length > 1);
            document.getElementById('quick-reset-text').textContent = nextMsg;
        };

        document.getElementById('btn-quick-reset-next').addEventListener('click', getNextQuickReset);

        // --- Focus Tools ---
        window.startFocusTool = (tool) => {
            if (tool === 'breathe') { showScreen('screen-tool-breathe'); startToolBreathe(); }
            else if (tool === 'bubble') { showScreen('screen-tool-bubble'); startToolBubble(); }
            else if (tool === 'release') { showScreen('screen-tool-release'); startToolRelease(); }
            else if (tool === 'study') { showScreen('screen-tool-study'); startToolStudy(); }
            else if (tool === 'react') { showScreen('screen-tool-react'); startToolReact(); }
            else if (tool === 'zen') { showScreen('screen-tool-zen'); startToolZen(); }
        };

        // Breathe Tool
        let toolBreatheTimeout;
        const startToolBreathe = () => {
            let toolBreatheCycles = 0;
            const circle = document.getElementById('tool-breathe-circle');
            const text = document.getElementById('tool-breathe-text');
            circle.style.transform = 'scale(1)';
            circle.textContent = 'Ready?';
            text.textContent = 'Starting in 3...';
            
            let countdown = 3;
            const countInt = setInterval(() => {
                countdown--;
                if (countdown > 0) text.textContent = `Starting in ${countdown}...`;
                else {
                    clearInterval(countInt);
                    text.textContent = '';
                    runToolBreatheCycle(1, 0);
                }
            }, 1000);

            document.getElementById('btn-tool-breathe-back').onclick = () => {
                clearInterval(countInt);
                clearTimeout(toolBreatheTimeout);
                showScreen('screen-focus-tools');
            };
        };

        const runToolBreatheCycle = (phase, cycles) => {
            const circle = document.getElementById('tool-breathe-circle');
            if (cycles >= 3) { circle.textContent = "You're ready."; document.getElementById('btn-tool-breathe-back').textContent = "Go back"; return; }
            if(phase === 1) {
                circle.textContent = 'Breathe in...';
                circle.style.transition = 'transform 4s linear';
                circle.style.transform = 'scale(1.8)';
                toolBreatheTimeout = setTimeout(() => runToolBreatheCycle(2, cycles), 4000);
            } else if(phase === 2) {
                circle.textContent = 'Hold...';
                toolBreatheTimeout = setTimeout(() => runToolBreatheCycle(3, cycles), 2000);
            } else if(phase === 3) {
                circle.textContent = 'Breathe out...';
                circle.style.transition = 'transform 6s linear';
                circle.style.transform = 'scale(1)';
                toolBreatheTimeout = setTimeout(() => {
                    const nextCycles = cycles + 1;
                    if(nextCycles < 3) runToolBreatheCycle(1, nextCycles);
                    else { circle.textContent = "You're ready."; document.getElementById('btn-tool-breathe-back').textContent = "Go back"; }
                }, 6000);
            }
        };

        // Fixed breathe tool — rewritten to avoid scoping bug
        const startToolBreatheFixed = () => {
            let cycles = 0;
            let phase = 0;
            const circle = document.getElementById('tool-breathe-circle');
            const text = document.getElementById('tool-breathe-text');
            circle.style.transform = 'scale(1)';
            circle.textContent = 'Ready?';
            text.textContent = 'Starting in 3...';
            
            let countdown = 3;
            const countInt = setInterval(() => {
                countdown--;
                if (countdown > 0) {
                    text.textContent = `Starting in ${countdown}...`;
                } else {
                    clearInterval(countInt);
                    text.textContent = '';
                    runCycle();
                }
            }, 1000);

            const runCycle = () => {
                if (cycles >= 3) {
                    circle.textContent = "You're ready.";
                    circle.style.background = 'var(--success-bg)';
                    circle.style.color = 'var(--success)';
                    circle.style.borderColor = 'var(--success)';
                    document.getElementById('btn-tool-breathe-back').textContent = "Go back";
                    return;
                }
                phase = 1;
                circle.textContent = 'Breathe in...';
                circle.style.transition = 'all 4s cubic-bezier(0.4, 0, 0.2, 1)';
                circle.style.transform = 'scale(1.5)';
                circle.style.background = 'var(--accent-soft)';
                toolBreatheTimeout = setTimeout(() => {
                    circle.textContent = 'Hold...';
                    toolBreatheTimeout = setTimeout(() => {
                        circle.textContent = 'Breathe out...';
                        circle.style.transition = 'all 6s cubic-bezier(0.4, 0, 0.2, 1)';
                        circle.style.transform = 'scale(1)';
                        toolBreatheTimeout = setTimeout(() => {
                            cycles++;
                            runCycle();
                        }, 6000);
                    }, 2000);
                }, 4000);
            };

            document.getElementById('btn-tool-breathe-back').onclick = () => {
                clearInterval(countInt);
                clearTimeout(toolBreatheTimeout);
                document.getElementById('btn-tool-breathe-back').textContent = "Cancel";
                showScreen('screen-focus-tools');
            };
        };

        // Override startToolBreathe with the fixed version
        window.startToolBreatheFixed = startToolBreatheFixed;
        const _origStartFocusTool = window.startFocusTool;
        window.startFocusTool = (tool) => {
            if (tool === 'breathe') { showScreen('screen-tool-breathe'); startToolBreatheFixed(); }
            else _origStartFocusTool(tool);
        };

        // Bubble Pop Tool
        let bubblePops = 0, bubbleTimer, bubbleInterval;
        const startToolBubble = () => {
            bubblePops = 0;
            const container = document.getElementById('bubble-container');
            container.innerHTML = '';
            document.getElementById('tool-bubble-done').classList.add('hidden');
            document.getElementById('btn-tool-bubble-cancel').classList.remove('hidden');
            document.getElementById('btn-tool-bubble-cancel').onclick = stopToolBubble;
            bubbleTimer = setTimeout(endToolBubble, 30000);
            bubbleInterval = setInterval(spawnBubble, 800);
            spawnBubble();
        };

        const spawnBubble = () => {
            if (bubblePops >= 15) return;
            const container = document.getElementById('bubble-container');
            const bubble = document.createElement('div');
            bubble.className = 'bubble';
            const size = Math.random() * 40 + 40;
            bubble.style.width = `${size}px`;
            bubble.style.height = `${size}px`;
            bubble.style.left = `${Math.random() * (container.clientWidth - size)}px`;
            bubble.style.top = `${Math.random() * (container.clientHeight - size - 100)}px`;
            
            // Add floating animation
            const duration = Math.random() * 2 + 3;
            bubble.style.transition = `transform ${duration}s ease-in-out, opacity 0.3s ease`;
            
            bubble.onclick = (e) => {
                InteractionSystem.createRipple(e.clientX, e.clientY);
                InteractionSystem.createParticles(e.clientX, e.clientY);
                bubble.classList.add('popped');
                bubblePops++;
                setTimeout(() => bubble.remove(), 300);
                if (bubblePops >= 15) endToolBubble();
            };
            
            container.appendChild(bubble);
            
            // Initial float
            requestAnimationFrame(() => {
                bubble.style.transform = `translate(${Math.random() * 20 - 10}px, ${-Math.random() * 40 - 20}px)`;
            });

            setTimeout(() => {
                if (container.contains(bubble) && !bubble.classList.contains('popped')) {
                    bubble.style.opacity = '0';
                    setTimeout(() => bubble.remove(), 300);
                }
            }, 4000);
        };

        const stopToolBubble = () => { clearTimeout(bubbleTimer); clearInterval(bubbleInterval); showScreen('screen-focus-tools'); };
        const endToolBubble = () => {
            clearTimeout(bubbleTimer); clearInterval(bubbleInterval);
            document.getElementById('bubble-container').innerHTML = '';
            document.getElementById('btn-tool-bubble-cancel').classList.add('hidden');
            document.getElementById('tool-bubble-done').classList.remove('hidden');
            document.getElementById('btn-tool-bubble-back').onclick = () => showScreen('screen-focus-tools');
        };

        // Release Tool
        const startToolRelease = () => {
            document.getElementById('tool-release-done').classList.add('hidden');
            document.getElementById('release-container').classList.remove('hidden');
            document.getElementById('btn-tool-release-cancel').classList.remove('hidden');
            const textarea = document.getElementById('release-textarea');
            textarea.value = '';
            textarea.classList.remove('dissolve');
            document.getElementById('btn-tool-release-cancel').onclick = () => showScreen('screen-focus-tools');
            const releaseQuotes = ["Let it go.", "You're doing better than you think.", "This moment will pass.", "You're in control.", "Breathe in peace, exhale tension.", "You are enough."];
            document.getElementById('btn-tool-release').onclick = () => {
                if(!textarea.value.trim()) return;
                textarea.classList.add('dissolve');
                document.getElementById('btn-tool-release').style.display = 'none';
                setTimeout(() => {
                    document.getElementById('release-container').classList.add('hidden');
                    document.getElementById('tool-release-done').classList.remove('hidden');
                    document.getElementById('btn-tool-release-cancel').classList.add('hidden');
                    document.getElementById('btn-tool-release').style.display = 'flex';
                    document.getElementById('release-quote-text').textContent = releaseQuotes[Math.floor(Math.random() * releaseQuotes.length)];
                }, 2000);
            };
            document.getElementById('btn-tool-release-back').onclick = () => showScreen('screen-focus-tools');
        };

        // Study Boost
        let studyQuestions = [], studyIndex = 0;
        const startToolStudy = () => {
            document.getElementById('study-setup').classList.remove('hidden');
            document.getElementById('study-flow').classList.add('hidden');
            document.getElementById('study-done').classList.add('hidden');
            document.getElementById('study-topic').value = '';
            document.getElementById('study-notes').value = '';
            document.getElementById('btn-study-cancel').onclick = () => showScreen('screen-focus-tools');
            document.getElementById('btn-study-back').onclick = () => showScreen('screen-focus-tools');
            document.getElementById('btn-study-start').onclick = () => {
                const topic = document.getElementById('study-topic').value.trim();
                if (!topic) return;
                studyQuestions = [
                    `What is the most fundamental concept of ${topic}?`,
                    `How would you explain ${topic} to a friend in one sentence?`,
                    `What is one thing about ${topic} you want to remember tomorrow?`
                ];
                studyIndex = 0;
                document.getElementById('study-flow-topic').textContent = topic;
                document.getElementById('study-setup').classList.add('hidden');
                document.getElementById('study-flow').classList.remove('hidden');
                document.getElementById('study-question').textContent = studyQuestions[0];
            };
            document.getElementById('btn-study-next').onclick = () => {
                studyIndex++;
                if (studyIndex < studyQuestions.length) {
                    document.getElementById('study-question').textContent = studyQuestions[studyIndex];
                } else {
                    document.getElementById('study-flow').classList.add('hidden');
                    document.getElementById('study-done').classList.remove('hidden');
                }
            };
        };

        // React Tool
        let reactRound = 0, reactTimeout;
        const startToolReact = () => {
            reactRound = 0;
            document.getElementById('tool-react-done').classList.add('hidden');
            document.getElementById('tool-react-counter').classList.remove('hidden');
            document.getElementById('tool-react-dot').style.display = 'none';
            document.getElementById('btn-tool-react-cancel').classList.remove('hidden');
            document.getElementById('btn-tool-react-cancel').onclick = () => { clearTimeout(reactTimeout); showScreen('screen-focus-tools'); };
            nextReactRound();
        };

        const nextReactRound = () => {
            if (reactRound >= 10) {
                document.getElementById('tool-react-dot').style.display = 'none';
                document.getElementById('tool-react-counter').classList.add('hidden');
                document.getElementById('btn-tool-react-cancel').classList.add('hidden');
                document.getElementById('tool-react-done').classList.remove('hidden');
                document.getElementById('btn-tool-react-back').onclick = () => showScreen('screen-focus-tools');
                return;
            }
            reactRound++;
            document.getElementById('tool-react-counter').textContent = `Round ${reactRound}/10`;
            document.getElementById('tool-react-dot').style.display = 'none';
            reactTimeout = setTimeout(() => {
                const dot = document.getElementById('tool-react-dot');
                const safeX = Math.max(20, Math.random() * (window.innerWidth > 440 ? 400 : window.innerWidth - 68));
                const safeY = Math.max(80, Math.random() * (window.innerHeight - 200));
                dot.style.left = `${safeX}px`;
                dot.style.top = `${safeY}px`;
                dot.style.display = 'block';
                dot.style.transform = 'scale(0)';
                setTimeout(() => dot.style.transform = 'scale(1)', 10);
                dot.onclick = () => { dot.style.display = 'none'; dot.onclick = null; nextReactRound(); };
            }, Math.random() * 1500 + 500);
        };

        // Zen Canvas
        const startToolZen = () => {
            const canvas = document.getElementById('zen-canvas');
            const ctx = canvas.getContext('2d');
            let drawing = false, lines = [];
            const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
            resize();
            const resizeObs = new ResizeObserver(resize);
            resizeObs.observe(canvas);

            const getPos = (e) => {
                const rect = canvas.getBoundingClientRect();
                const src = e.touches ? e.touches[0] : e;
                return { x: src.clientX - rect.left, y: src.clientY - rect.top };
            };

            const startDraw = (e) => { e.preventDefault(); drawing = true; lines.push({...getPos(e), age: 0, start: true}); };
            const endDraw = () => { drawing = false; };
            const addPoint = (e) => { if(drawing) { e.preventDefault(); lines.push({...getPos(e), age: 0}); } };

            canvas.addEventListener('mousedown', startDraw);
            canvas.addEventListener('mousemove', addPoint);
            window.addEventListener('mouseup', endDraw);
            canvas.addEventListener('touchstart', startDraw, {passive:false});
            canvas.addEventListener('touchmove', addPoint, {passive:false});
            window.addEventListener('touchend', endDraw);

            const animate = () => {
                if (currentScreen !== 'screen-tool-zen') return;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 4;
                for (let i = 1; i < lines.length; i++) {
                    if (lines[i].start) continue;
                    const alpha = Math.max(0, 1 - lines[i].age / 100);
                    // Use premium purple/blue gradient colors for the zen canvas lines
                    ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
                    ctx.beginPath();
                    ctx.moveTo(lines[i-1].x, lines[i-1].y);
                    ctx.lineTo(lines[i].x, lines[i].y);
                    ctx.stroke();
                }
                lines.forEach(p => p.age++);
                lines = lines.filter(p => p.age < 100);
                requestAnimationFrame(animate);
            };
            animate();

            document.getElementById('btn-tool-zen-back').onclick = () => {
                resizeObs.disconnect();
                window.removeEventListener('mouseup', endDraw);
                window.removeEventListener('touchend', endDraw);
                showScreen('screen-focus-tools');
            };
        };

        // --- Bottom Sheet & Add Logic ---
        const sheet = document.getElementById('add-sheet');
        fab.addEventListener('click', () => sheet.classList.add('open'));
        document.addEventListener('mousedown', (e) => {
            if(!sheet.contains(e.target) && !fab.contains(e.target)) sheet.classList.remove('open');
        });
        document.addEventListener('touchstart', (e) => {
            if(!sheet.contains(e.target) && !fab.contains(e.target)) sheet.classList.remove('open');
        });

        document.getElementById('tab-add-task').onclick = () => {
            document.getElementById('tab-add-task').classList.add('active');
            document.getElementById('tab-add-reminder').classList.remove('active');
            document.getElementById('form-task').classList.remove('hidden');
            document.getElementById('form-reminder').classList.add('hidden');
        };

        document.getElementById('tab-add-reminder').onclick = () => {
            document.getElementById('tab-add-reminder').classList.add('active');
            document.getElementById('tab-add-task').classList.remove('active');
            document.getElementById('form-reminder').classList.remove('hidden');
            document.getElementById('form-task').classList.add('hidden');
        };

        document.querySelectorAll('#add-task-time .pill-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('#add-task-time .pill-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            };
        });

        document.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            };
        });

        document.getElementById('btn-submit-task').onclick = () => {
            const name = document.getElementById('add-task-name').value.trim();
            if(!name) return;
            const subject = document.getElementById('add-task-subject').value.trim();
            const deadline = document.getElementById('add-task-deadline').value;
            const mins = parseInt(document.querySelector('#add-task-time .pill-btn.active').dataset.val);
            const newTask = { id: 't_' + Date.now(), name, subject, deadline, estimatedMins: mins, done: false, createdAt: new Date().toISOString() };
            saveState('tasks', [newTask, ...state.tasks]);
            sheet.classList.remove('open');
            document.getElementById('add-task-name').value = '';
            document.getElementById('add-task-subject').value = '';
            document.getElementById('add-task-deadline').value = '';
            renderMain();
            renderTasks();
        };

        document.getElementById('btn-submit-reminder').onclick = async () => {
            const text = document.getElementById('add-reminder-text').value.trim();
            if(!text) return;
            const emoji = document.querySelector('.emoji-btn.selected').textContent;
            const time = document.getElementById('add-reminder-time').value;
            if(time && Notification.permission !== 'granted') await Notification.requestPermission();
            const newRem = { id: 'r_' + Date.now(), emoji, text, time, notified: false };
            saveState('reminders', [newRem, ...state.reminders]);
            sheet.classList.remove('open');
            document.getElementById('add-reminder-text').value = '';
            document.getElementById('add-reminder-time').value = '';
            renderMain();
            renderReminders();
        };

        // --- Focus Mode ---
        let currentFocusTaskId = null, focusTimerInterval = null, focusTimeLeft = 1500, isFocusActive = false;

        window.startFocus = (taskId) => {
            currentFocusTaskId = taskId;
            const task = state.tasks.find(t => t.id === taskId);
            if (!task) return;
            document.getElementById('focus-task-name').textContent = task.name;
            document.getElementById('distraction-task-name').textContent = task.name;
            isFocusActive = true;
            focusTimeLeft = task.estimatedMins ? task.estimatedMins * 60 : 1500;
            updateFocusDisplay();
            showScreen('screen-focus');
            clearInterval(focusTimerInterval);
            focusTimerInterval = setInterval(() => {
                focusTimeLeft--;
                updateFocusDisplay();
                if(focusTimeLeft <= 0) { clearInterval(focusTimerInterval); }
            }, 1000);
        };

        const updateFocusDisplay = () => {
            const m = Math.floor(focusTimeLeft / 60);
            const s = focusTimeLeft % 60;
            document.getElementById('focus-timer').textContent = `${m}:${s.toString().padStart(2,'0')}`;
        };

        document.getElementById('btn-focus-done').onclick = () => {
            clearInterval(focusTimerInterval);
            isFocusActive = false;
            if (currentFocusTaskId) toggleTask(currentFocusTaskId);
            showScreen('screen-main');
        };

        document.getElementById('btn-focus-break').onclick = () => {
            clearInterval(focusTimerInterval);
            showScreen('screen-breathe');
            startBreatheBreak();
        };

        document.addEventListener('visibilitychange', () => {
            if (document.hidden && isFocusActive) {
                document.getElementById('overlay-distraction').classList.remove('hidden');
            }
        });

        document.getElementById('btn-distraction-back').onclick = () => document.getElementById('overlay-distraction').classList.add('hidden');
        document.getElementById('btn-distraction-done').onclick = () => {
            document.getElementById('overlay-distraction').classList.add('hidden');
            document.getElementById('btn-focus-done').click();
        };

        // Breathe Break
        let breatheLoop = 1;
        const startBreatheBreak = () => { breatheLoop = 1; runBreatheCycle(); };
        const runBreatheCycle = () => {
            const circle = document.getElementById('breathe-circle');
            const label = document.getElementById('breathe-label');
            label.textContent = `Loop ${breatheLoop}/2`;
            circle.textContent = "Breathe in...";
            circle.style.transition = "transform 4s ease-in-out";
            circle.style.transform = "scale(1.5)";
            setTimeout(() => {
                circle.textContent = "Hold...";
                setTimeout(() => {
                    circle.textContent = "Breathe out...";
                    circle.style.transform = "scale(1)";
                    circle.style.transition = "transform 8s ease-in-out";
                    setTimeout(() => {
                        if(breatheLoop < 2) { breatheLoop++; runBreatheCycle(); }
                        else circle.textContent = "Done.";
                    }, 8000);
                }, 7000);
            }, 4000);
        };

        document.getElementById('btn-breathe-ready').onclick = () => {
            if (currentFocusTaskId) startFocus(currentFocusTaskId);
            else showScreen('screen-main');
        };

        // Evening Reflection
        const checkEveningReflection = () => {
            const now = new Date();
            const today = getTodayStr();
            const doneToday = state.reflections.some(r => r.date === today);
            if(now.getHours() >= 20 && !doneToday) {
                setTimeout(() => {
                    const overlay = document.getElementById('overlay-evening');
                    const content = document.getElementById('evening-content');
                    const nextTask = state.tasks.find(t => !t.done) || {name: "Plan your first task"};
                    content.innerHTML = `
                        <h2 class="mb-16">How did today actually go?</h2>
                        <p class="small mb-16">Reflection helps you grow.</p>
                        <p class="small mb-8">How did the day play out?</p>
                        <div class="flex gap-8 mb-16" style="flex-wrap: wrap;">
                            <div class="pill-btn active" data-ref="howItWent" data-val="Smooth ✨">Smooth ✨</div>
                            <div class="pill-btn" data-ref="howItWent" data-val="Bumpy 🤕">Bumpy 🤕</div>
                            <div class="pill-btn" data-ref="howItWent" data-val="Mixed 🎢">Mixed 🎢</div>
                            <div class="pill-btn" data-ref="howItWent" data-val="Survival 🛡️">Survival 🛡️</div>
                        </div>
                        <p class="small mb-8">Did you do the thing you meant to?</p>
                        <div class="flex gap-8 mb-24" style="flex-wrap: wrap;">
                            <div class="pill-btn active" data-ref="onTrack" data-val="Yep ✅">Yep ✅</div>
                            <div class="pill-btn" data-ref="onTrack" data-val="Some 🔄">Some 🔄</div>
                            <div class="pill-btn" data-ref="onTrack" data-val="Not really 🌊">Not really 🌊</div>
                        </div>
                        <p class="small mb-8">First thing for tomorrow?</p>
                        <input type="text" id="ref-tomorrow" placeholder="One word is fine." class="mb-24">
                        <p class="small mb-16 text-muted">Next up: ${nextTask.name}</p>
                        <button id="btn-save-reflection">Close</button>
                    `;
                    overlay.classList.remove('hidden');
                    content.querySelectorAll('.pill-btn').forEach(btn => {
                        btn.onclick = () => {
                            content.querySelectorAll(`.pill-btn[data-ref="${btn.dataset.ref}"]`).forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                        };
                    });
                    document.getElementById('btn-save-reflection').onclick = () => {
                        const reflection = {
                            date: today,
                            howItWent: content.querySelector('.pill-btn[data-ref="howItWent"].active').dataset.val,
                            onTrack: content.querySelector('.pill-btn[data-ref="onTrack"].active').dataset.val,
                            tomorrowFirst: document.getElementById('ref-tomorrow').value
                        };
                        saveState('reflections', [...state.reflections, reflection]);
                        overlay.classList.add('hidden');
                    };
                }, 2000);
            }
        };

        // Nudge
        const nudges = [
            "💧 Grab some water before the next one.",
            "🪟 Look at something far away for 20 seconds. Your eyes need it.",
            "🧍 You've been sitting a while. Stand up, shake it out.",
            "🌬️ Three slow breaths. In through the nose, long out through the mouth.",
            "🎉 You actually finished that. That counts.",
            "🫀 Are your shoulders near your ears? Let them drop.",
            "📵 Notifications off for the next one?",
            "🍎 When did you last eat? Low fuel = foggy thinking.",
            "⏰ Still roughly on track today? 30-second check.",
            "☀️ Is there natural light where you are? Move if not."
        ];

        const showNudge = () => {
            // Inline nudge as a toast
            const existing = document.getElementById('nudge-toast');
            if (existing) existing.remove();
            const toast = document.createElement('div');
            toast.id = 'nudge-toast';
            toast.style.cssText = `
                position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
                background: white; border-radius: 12px; padding: 12px 16px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.12); z-index: 500;
                font-size: 14px; max-width: 320px; width: calc(100% - 48px);
                border: 1px solid rgba(0,0,0,0.06); animation: slideUp 0.3s ease;
            `;
            toast.textContent = nudges[Math.floor(Math.random() * nudges.length)];
            document.body.appendChild(toast);
            setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.5s'; setTimeout(() => toast.remove(), 500); }, 5000);
        };

        // Notifications
        setInterval(() => {
            if(Notification.permission === 'granted') {
                const now = new Date();
                const hhmm = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
                let changed = false;
                state.reminders.forEach(r => {
                    if(r.time === hhmm && !r.notified) {
                        new Notification("NOW reminder", { body: r.text });
                        r.notified = true;
                        changed = true;
                    }
                });
                if(changed) { saveState('reminders', state.reminders); if(currentScreen === 'screen-main') renderMain(); }
            }
        }, 60000);

        // --- FIXED: showDailyAdvice ---
        // Uses sessionStorage keyed to today's date so it shows once per day per session
        const showDailyAdvice = () => {
            const todayKey = 'advice_shown_' + getTodayStr();
            if (sessionStorage.getItem(todayKey)) return;

            const randomMsg = mentalAdviceMessages[Math.floor(Math.random() * mentalAdviceMessages.length)];
            
            // Set text BEFORE making overlay visible
            const adviceTextEl = document.getElementById('advice-text');
            adviceTextEl.textContent = randomMsg;
            
            // Small RAF to ensure DOM paint before showing
            requestAnimationFrame(() => {
                document.getElementById('overlay-advice').classList.remove('hidden');
            });

            document.getElementById('btn-advice-continue').onclick = () => {
                document.getElementById('overlay-advice').classList.add('hidden');
                sessionStorage.setItem(todayKey, 'true');
            };
        };

        // --- Signout ---
        const handleSignOut = async () => { 
            if (supabaseInstance) await supabaseInstance.auth.signOut();
            localStorage.clear(); 
            location.reload(); 
        };
        document.getElementById('btn-signout').addEventListener('click', handleSignOut);
        document.getElementById('btn-signout-pre').addEventListener('click', handleSignOut);

        // --- Init ---
        const init = async () => {
            const user = getUser();
            const pinHash = getPinHash();
            if (user && pinHash) {
                // Try auto-login with Supabase if session exists
                if (supabaseInstance) {
                    const { data: { session } } = await supabaseInstance.auth.getSession();
                    if (session) {
                        await loadStateFromSupabase();
                        checkCheckin();
                        return;
                    }
                }
                document.getElementById('entry-greeting').textContent = `Welcome back, ${user}.`;
                showScreen('screen-pin-entry');
            } else {
                showScreen('screen-login');
            }
        };

        // Add slideUp animation
        const style = document.createElement('style');
        style.textContent = `@keyframes slideUp { from { opacity:0; transform: translateX(-50%) translateY(10px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }`;
        document.head.appendChild(style);

        init();
    