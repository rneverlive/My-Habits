(function () {
  const { useEffect, useMemo, useRef, useState } = React;

  const STORAGE_KEY = "habit_supps_tracker_v2_wei";
  const THEME_KEY = "hst_theme"; // "light" | "dark"

  const todayStr = (d = new Date()) => d.toISOString().slice(0, 10);
  const startOfWeek = (date = new Date()) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day; // Monday start
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };

  const defaultHabits = [
    { id: "meditation", name: "Медитация", category: "Здоровье" },
    { id: "breath", name: "Дыхательные практики", category: "Здоровье" },
    { id: "run", name: "Лёгкий бег / прогулка", category: "Движение" },
    { id: "reading", name: "Чтение", category: "Фокус" },
    { id: "haircare", name: "Уход за волосами", category: "Уход" },
    { id: "journal", name: "Дневник (2–3 предложения)", category: "Фокус" },
    { id: "weigh", name: "Вес записан", category: "Мониторинг" }
  ];
  const defaultSupps = [
    { id: "creatine", name: "Креатин", dosage: "5 г", timing: "morning", days: "daily", notes: "Можно и в дни тренировки" },
    { id: "glutamine", name: "Глютамин", dosage: "5 г", timing: "morning", days: "daily", notes: "Утром натощак" },
    { id: "citrulline", name: "Цитрулин малат", dosage: "5 г", timing: "pre-workout", days: "workout", notes: "Перед тренировкой" },
    { id: "beta-alanine", name: "Бета-аланин", dosage: "5 г", timing: "pre-workout", days: "workout", notes: "Перед тренировкой" },
    { id: "d3k2", name: "Витамин D3+K2", dosage: "1 таб", timing: "any", days: "daily", notes: "С едой" },
    { id: "ashwagandha", name: "Ашваганда 450 мг", dosage: "1 капс", timing: "evening", days: "daily", notes: "За 1ч до сна" },
    { id: "5htp", name: "5-HTP", dosage: "1–3 капс", timing: "evening", days: "daily", notes: "Перед сном (по ощущениям)" },
    { id: "zinc-b6", name: "Цинк + B6 (запас)", dosage: "по инструкции", timing: "any", days: "rest", notes: "Пока не принимаешь" },
    { id: "tyrosine", name: "L-тирозин (запас)", dosage: "по инструкции", timing: "any", days: "rest", notes: "Пока не принимаешь" }
  ];
  const TIMINGS = [
    { id: "morning", label: "Утро" },
    { id: "pre-workout", label: "Пeред тренировкой" },
    { id: "post-workout", label: "После тренировки" },
    { id: "evening", label: "Вечер" },
    { id: "any", label: "В любое время" }
  ];

  function loadState(){ try{ const raw=localStorage.getItem(STORAGE_KEY); return raw? JSON.parse(raw): null; }catch{return null;} }
  function saveState(s){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }catch{} }
  function loadTheme(){ try{ return localStorage.getItem(THEME_KEY) || "light"; }catch{return "light";} }
  function saveTheme(t){ try{ localStorage.setItem(THEME_KEY, t); }catch{} }

  function App(){
    const [date, setDate] = useState(todayStr());
    const [habits, setHabits] = useState(defaultHabits);
    const [supps, setSupps] = useState(defaultSupps);
    const [workoutDay, setWorkoutDay] = useState(false);
    const [completed, setCompleted] = useState({});
    const [weightToday, setWeightToday] = useState(0);

    const [notifEnabled, setNotifEnabled] = useState(false);
    const [reminderTimes, setReminderTimes] = useState({
      morning: "09:00", "pre-workout": "16:00", "post-workout": "19:30", evening: "22:00"
    });

    const [statsType, setStatsType] = useState("supp");
    const [statsItemId, setStatsItemId] = useState("");
    const [statsPeriod, setStatsPeriod] = useState("week");
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");

    const [weightRange, setWeightRange] = useState("60");

    const [theme, setTheme] = useState(loadTheme());
    const toggleTheme = () => setTheme(t => t==="dark" ? "light" : "dark");

    const [newHabit, setNewHabit] = useState({ name:"", category:"Общее" });
    const [newSupp, setNewSupp] = useState({ name:"", dosage:"", timing:"any", days:"daily", notes:"" });

    const fileInputRef = useRef(null);
    const exportJSON = () => {
      const payload = { habits, supps, completed, reminderTimes };
      const blob = new Blob([JSON.stringify(payload,null,2)], { type:"application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `tracker_backup_${date}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    };
    function mergeCollectionsById(current=[], incoming=[]){
      const byId = new Map(current.map(it=>[it.id, { ...it }]));
      for (const inc of incoming){
        if (!inc || !inc.id) continue;
        if (byId.has(inc.id)){ const cur = byId.get(inc.id); byId.set(inc.id, { ...inc, ...cur }); }
        else { byId.set(inc.id, { ...inc }); }
      }
      return Array.from(byId.values());
    }
    function mergeCompleted(current={}, incoming={}){
      const out = { ...current };
      for (const k of Object.keys(incoming)){
        const curDay = current[k] || { habits:{}, supps:{}, workoutDay:false, weight:null };
        const incDay = incoming[k] || {};
        out[k] = {
          habits: { ...(curDay.habits||{}), ...(incDay.habits||{}) },
          supps:  { ...(curDay.supps||{}),  ...(incDay.supps||{})  },
          workoutDay: !!(curDay.workoutDay || incDay.workoutDay),
          weight: curDay.weight != null ? curDay.weight : (incDay.weight != null ? incDay.weight : null)
        };
      }
      return out;
    }
    const importJSON = (file) => {
      const reader = new FileReader();
      reader.onload = () => {
        try{
          const data = JSON.parse(reader.result);
          if (Array.isArray(data.habits)) setHabits(prev => mergeCollectionsById(prev, data.habits));
          if (Array.isArray(data.supps))  setSupps(prev => mergeCollectionsById(prev, data.supps));
          if (data.completed && typeof data.completed === "object")
            setCompleted(prev => mergeCompleted(prev, data.completed));
          if (data.reminderTimes && typeof data.reminderTimes === "object")
            setReminderTimes(prev => ({ ...data.reminderTimes, ...prev }));
        }catch{ alert("Не удалось импортировать: неверный JSON"); }
      };
      reader.readAsText(file);
    };

    useEffect(()=>{ const s=loadState(); if(s){ setHabits(s.habits||defaultHabits); setSupps(s.supps||defaultSupps); setCompleted(s.completed||{}); setReminderTimes(s.reminderTimes||reminderTimes);} },[]);
    useEffect(()=>{ saveState({ habits, supps, completed, reminderTimes }); },[habits, supps, completed, reminderTimes]);
    useEffect(()=>{ setCompleted(prev => prev[date]? prev : ({ ...prev, [date]: { habits:{}, supps:{}, workoutDay:false, weight:null } })); },[date]);
    useEffect(()=>{ const rec=completed[date]; if(rec){ setWorkoutDay(!!rec.workoutDay); setWeightToday(rec.weight ?? 0);} },[date,completed]);
    useEffect(()=>{ if(statsType!=="workout" && !statsItemId){ const list = statsType==="supp"? supps : habits; if(list.length) setStatsItemId(list[0].id);} if(statsType==="workout") setStatsItemId(""); },[statsType, supps, habits]);
    useEffect(()=>{ saveTheme(theme); },[theme]);

    useEffect(()=>{ if(!notifEnabled) return; const t=setInterval(()=>{ const now=new Date(); const key=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`; const hit=Object.entries(reminderTimes).find(([,v])=>v===key); if(hit && typeof Notification!=="undefined"){ const body = dueSupplementsForTiming(hit[0]).join(", "); if(body){ new Notification("Напоминание", { body: `Добавки: ${body}` }); } } },60000); return ()=>clearInterval(t); },[notifEnabled, reminderTimes, completed, workoutDay, habits, supps, date]);
    const ensurePermission = async ()=>{ if(typeof Notification!=="undefined"){ if(Notification.permission!=="granted"){ const p=await Notification.requestPermission(); if(p==="granted") setNotifEnabled(true); } else setNotifEnabled(true);} };

    const toggleHabit = (id)=> setCompleted(prev=>{ const day=prev[date]||{habits:{},supps:{},workoutDay:false,weight:null}; return { ...prev, [date]: { ...day, habits:{ ...day.habits, [id]: !day.habits?.[id] } } };});
    const toggleSupp  = (id)=> setCompleted(prev=>{ const day=prev[date]||{habits:{},supps:{},workoutDay:false,weight:null}; return { ...prev, [date]: { ...day, supps:{ ...day.supps, [id]: !day.supps?.[id] } } };});
    const setWorkout  = (v)=> { setWorkoutDay(v); setCompleted(prev=>{ const day=prev[date]||{habits:{},supps:{},workoutDay:false,weight:null}; return { ...prev, [date]: { ...day, workoutDay:v } };});};
    const setWeight   = (val)=>{ const num=isNaN(Number(val))? null: Number(val); setWeightToday(num||0); setCompleted(prev=>{ const day=prev[date]||{habits:{},supps:{},workoutDay:false,weight:null}; return { ...prev, [date]: { ...day, weight:num } };});};

    const addHabit = ()=>{ const name=(newHabit.name||"").trim(); if(!name) return; const id = name.toLowerCase().replace(/[^a-zа-я0-9]+/gi,"-")+"-"+Math.random().toString(36).slice(2,6); setHabits(prev=>[...prev,{ id, name, category:newHabit.category||"Общее" }]); setNewHabit({ name:"", category:"Общее" }); };
    const deleteHabit = (id)=> setHabits(prev=>prev.filter(h=>h.id!==id));
    const addSupp = ()=>{ const name=(newSupp.name||"").trim(); if(!name) return; const id = name.toLowerCase().replace(/[^a-zа-я0-9]+/gi,"-")+"-"+Math.random().toString(36).slice(2,6); setSupps(prev=>[...prev,{ id, name, dosage:newSupp.dosage, timing:newSupp.timing, days:newSupp.days, notes:newSupp.notes }]); setNewSupp({ name:"", dosage:"", timing:"any", days:"daily", notes:"" }); };
    const deleteSupp = (id)=> setSupps(prev=>prev.filter(s=>s.id!==id));

    const weekDates = useMemo(()=>{ const s=startOfWeek(new Date(date)); return Array.from({length:7},(_,i)=> todayStr(addDays(s,i))); },[date]);
    const dayRecord = completed[date] || { habits:{}, supps:{}, workoutDay:false, weight:null };
    const filteredSupps = useMemo(()=> supps.filter(s => s.days==="daily" || (s.days==="workout"&&workoutDay) || (s.days==="rest"&&!workoutDay)), [supps, workoutDay]);

    function dueSupplementsForTiming(timing){ const available = filteredSupps.filter(s => s.timing===timing || s.timing==="any"); return available.filter(s => !dayRecord.supps?.[s.id]).map(s=>s.name); }
    function dueHabitsSuggestion(timing){ const pref={ morning:new Set(["meditation","breath","weigh"]), evening:new Set(["haircare","journal","reading"]) }; const set=pref[timing]; if(!set) return []; return habits.filter(h=>set.has(h.id) && !dayRecord.habits?.[h.id]).map(h=>h.name); }

    function periodBounds(kind, baseDateStr){ const base=new Date(baseDateStr); const s=new Date(base); const e=new Date(base); if(kind==="week"){ const start=startOfWeek(base); const end=addDays(start,6); return [start,end]; } if(kind==="month"){ s.setDate(1); s.setHours(0,0,0,0); e.setMonth(e.getMonth()+1,0); e.setHours(23,59,59,999); return [s,e]; } if(kind==="year"){ s.setMonth(0,1); s.setHours(0,0,0,0); e.setMonth(11,31); e.setHours(23,59,59,999); return [s,e]; } return [customStart? new Date(customStart): s, customEnd? new Date(customEnd): e]; }
    function inRange(ds, start, end){ const d=new Date(ds); d.setHours(12,0,0,0); return d>=start && d<=end; }
    function parseDosage(str=""){ const m=(str||"").replace(",",".").match(/([0-9]+(?:\\.[0-9]+)?)[\\s]*([a-zA-Zа-яА-Яµμгмклкаптаб]*)?/); if(!m) return {value:null,unit:null}; let v=m[1]? parseFloat(m[1]): null; let u=m[2]||null; if(u) u=u.trim(); if(u){ const l=u.toLowerCase(); if(["г","g"].includes(l)) u="g"; else if(["мг","mg"].includes(l)) u="mg"; else if(l.startsWith("кап")) u="caps"; else if(l.startsWith("таб")) u="tabs"; else u=l;} return { value:isNaN(v)? null: v, unit:u}; }

    const stats = React.useMemo(()=>{ const [s,e]=periodBounds(statsPeriod,date); const keys=Object.keys(completed).filter(k=>inRange(k,s,e)); const days=keys.length; if(statsType==="workout"){ const workouts=keys.reduce((a,k)=>a+(completed[k]?.workoutDay?1:0),0); return { daysCount:days, workouts, rate: days? Math.round((workouts/days)*100):0 }; } if(statsType==="habit"){ const done=keys.reduce((a,k)=>a+(completed[k]?.habits?.[statsItemId]?1:0),0); return { daysCount:days, doneDays:done, rate: days? Math.round((done/days)*100):0 }; } const supp=supps.find(s=>s.id===statsItemId); const done=keys.filter(k=>completed[k]?.supps?.[statsItemId]).length; const { value, unit }=parseDosage(supp?.dosage||""); const total= value? +(value*done).toFixed(2): null; return { daysCount:days, doneDays:done, rate: days? Math.round((done/days)*100):0, totalDose: total, unit }; },[statsType,statsItemId,statsPeriod,customStart,customEnd,completed,habits,supps,date]);

    const weightPoints = useMemo(()=> Object.keys(completed).filter(k=>typeof completed[k]?.weight==="number").sort().map(k=>({date:k, value:completed[k].weight})), [completed]);
    const rangedWeightPoints = useMemo(()=>{ if(weightRange==="all") return weightPoints; const n=parseInt(weightRange,10); const end=new Date(date); const start=addDays(end,-(n-1)); return weightPoints.filter(p=> new Date(p.date)>=start && new Date(p.date)<=end); },[weightPoints, weightRange, date]);
    const monthlyAverages = useMemo(()=>{ const map=new Map(); for(const p of weightPoints){ const d=new Date(p.date); const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; if(!map.has(key)) map.set(key,{sum:0,count:0}); const e=map.get(key); e.sum+=p.value; e.count++; } return Array.from(map.entries()).map(([k,v])=>({month:k, avg:+(v.sum/v.count).toFixed(2)})).sort((a,b)=>a.month.localeCompare(b.month)); },[weightPoints]);

    useEffect(()=>{ // self-tests
      console.assert(typeof exportJSON==="function","exportJSON should be a function");
      console.assert(typeof importJSON==="function","importJSON should be a function");
      const a=parseDosage("5 г"); console.assert(a.value===5 && a.unit==="g","parseDosage 5 г");
      const b=parseDosage("450 мг"); console.assert(b.value===450 && b.unit==="mg","parseDosage 450 мг");
      const [ws,we]=periodBounds("week", todayStr()); const span=Math.round((we-ws)/(1000*60*60*24))+1; console.assert(span===7,"week=7 days");
      const cur={ "2025-01-01":{habits:{a:true},supps:{x:false},workoutDay:false,weight:null} };
      const inc={ "2025-01-01":{habits:{b:true},supps:{x:true},workoutDay:true,weight:77.7}, "2025-01-02":{habits:{a:true},supps:{},workoutDay:false,weight:null} };
      const m1=mergeCompleted(cur,inc); console.assert(m1["2025-01-01"].supps.x===true,"supp OR merge"); console.assert(m1["2025-01-01"].habits.a && m1["2025-01-01"].habits.b,"habits union"); console.assert(m1["2025-01-01"].weight===77.7,"weight prefer imported if current null");
      const cur2={ "2025-01-03":{habits:{},supps:{},workoutDay:false,weight:80} }; const m2=mergeCompleted(cur2,{ "2025-01-03":{weight:79}}); console.assert(m2["2025-01-03"].weight===80,"keep existing weight");
      console.assert(["light","dark"].includes(theme),"theme must be light|dark");
    },[]);

    const WeightChart = ({ points }) => {
      if (!points || points.length < 2) return React.createElement("div", { className: "muted" }, "Недостаточно данных для графика. Введите вес хотя бы за 2 дня.");
      const w=700,h=180,pad=24; const min=Math.min(...points.map(p=>p.value)); const max=Math.max(...points.map(p=>p.value));
      const x=(i)=> pad + (i*(w-2*pad))/(points.length-1);
      const y=(v)=> max===min? h/2 : pad + (h-2*pad)*(1-(v-min)/(max-min));
      const d=points.map((p,i)=>`${i===0?'M':'L'} ${x(i)} ${y(p.value)}`).join(' ');
      const gridY=[min,(min+max)/2,max];
      return React.createElement("svg", { viewBox:`0 0 ${w} ${h}`, className:"chart" },
        ...gridY.map((gv,i)=> React.createElement("g",{key:i},
          React.createElement("line",{x1:pad,x2:w-pad,y1:y(gv),y2:y(gv),stroke:"var(--border)",strokeDasharray:"4 4"}),
          React.createElement("text",{x:w-pad+4,y:y(gv)+4,fontSize:"10",fill:"var(--muted)"},gv.toFixed(1))
        )),
        React.createElement("path",{d,fill:"none",stroke:"var(--accent)",strokeWidth:"2"}),
        ...points.map((p,i)=>(React.createElement("circle",{key:p.date,cx:x(i),cy:y(p.value),r:"2.5",fill:"var(--accent)"})))
      );
    };

    return React.createElement("div", { className: `app ${theme==="dark"?"theme-dark":"theme-light"}` },
      React.createElement("style", null, `
        :root{
          --bg:#f8fafc; --panel:#ffffff; --text:#0f172a; --muted:#64748b;
          --border:#e5e7eb; --accent:#0ea5e9; --accent-2:#10b981; --danger:#ef4444; --card:#f1f5f9;
        }
        .theme-dark{
          --bg:#0b1220; --panel:#111827; --text:#e5e7eb; --muted:#9ca3af;
          --border:#1f2937; --accent:#38bdf8; --accent-2:#34d399; --danger:#f87171; --card:#0f172a;
        }
        *{box-sizing:border-box} body,html,.app{height:100%;margin:0}
        .app{background:var(--bg);color:var(--text);padding:16px}
        .container{max-width:1100px;margin:0 auto}
        .header{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;justify-content:space-between}
        .hstack{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
        .title{font-size:22px;font-weight:700}.muted{color:var(--muted);font-size:12px}
        .panel{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:12px}
        .card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px}
        .btn{border:1px solid var(--border);background:var(--panel);color:var(--text);padding:8px 12px;border-radius:10px;cursor:pointer}
        .btn.primary{background:var(--text);color:var(--panel);border-color:var(--text)}
        .btn.danger{background:transparent;color:var(--danger);border-color:var(--danger)}
        .btn.toggle{background:var(--panel)}
        .input,.select{padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--panel);color:var(--text)}
        .grid7{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}.grid6{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}
        .grid12{display:grid;grid-template-columns:repeat(12,1fr);gap:8px}
        .row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}
        .split{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .list{display:flex;flex-direction:column;gap:8px}
        .chart{width:100%;height:190px}
        .progress{height:8px;background:var(--border);border-radius:6px;overflow:hidden}
        .progress>div{height:8px;background:var(--accent-2)}
        .kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
        .footer{margin-top:24px;font-size:12px;color:var(--muted)}
        @media (max-width:860px){.split{grid-template-columns:1fr}.kpi{grid-template-columns:repeat(2,1fr)}}
      `),
      React.createElement("div",{className:"container"},
        React.createElement("div",{className:"header"},
          React.createElement("div",null,
            React.createElement("div",{className:"title"},"Трекер привычек и БАДов"),
            React.createElement("div",{className:"muted"},"Локально, без аккаунта. Импорт/экспорт поддерживаются.")
          ),
          React.createElement("div",{className:"hstack"},
            React.createElement("input",{type:"date",className:"input",value:date,onChange:e=>setDate(e.target.value)}),
            React.createElement("label",{className:"hstack panel"},
              React.createElement("input",{type:"checkbox",checked:workoutDay,onChange:e=>setWorkout(e.target.checked)}),
              React.createElement("span",null,"День тренировки")
            ),
            React.createElement("label",{className:"hstack panel"},
              React.createElement("span",{className:"muted"},"Вес, кг"),
              React.createElement("input",{type:"number",step:"0.1",className:"input",style:{width:80},value:weightToday??0,onChange:e=>setWeight(e.target.value)})
            ),
            React.createElement("button",{className:"btn toggle",onClick:()=>setTheme(theme==="dark"?"light":"dark")}, theme==="dark"?"☀️ Светлая":"🌙 Тёмная")
          )
        ),
        (function Panel(children, style){ return React.createElement("div",{className:"panel",style},children); })([
          React.createElement("div",{className:"row"},
            React.createElement("div",{style:{fontWeight:600}},"Вес: график и средние"),
            React.createElement("label",{className:"hstack"},
              React.createElement("span",{className:"muted"},"Интервал"),
              React.createElement("select",{className:"select",value:weightRange,onChange:e=>setWeightRange(e.target.value)},
                React.createElement("option",{value:"7"},"7 дн"),
                React.createElement("option",{value:"30"},"30 дн"),
                React.createElement("option",{value:"60"},"60 дн"),
                React.createElement("option",{value:"90"},"90 дн"),
                React.createElement("option",{value:"all"},"все данные")
              )
            )
          ),
          React.createElement("div",{style:{marginTop:8}}, React.createElement(WeightChart,{points:rangedWeightPoints})),
          React.createElement("div",{style:{marginTop:12}},
            React.createElement("div",{style:{fontWeight:500,marginBottom:8,fontSize:14}},"Средние по месяцам"),
            monthlyAverages.length
              ? React.createElement("div",{className:"grid6"},
                  ...monthlyAverages.map(m =>
                    React.createElement("div",{key:m.month,className:"card"},
                      React.createElement("div",{className:"muted"},m.month),
                      React.createElement("div",{style:{fontWeight:600,fontSize:18}},`${m.avg} кг`)
                    )
                  )
                )
              : React.createElement("div",{className:"muted"},"Нет данных для расчёта средних — внеси вес минимум за один день.")
          )
        ],{marginTop:16}),
        React.createElement("div",{className:"hstack",style:{marginTop:12,flexWrap:"wrap"}},
          React.createElement("button",{className:"btn primary",onClick:exportJSON},"Экспорт JSON"),
          React.createElement("button",{className:"btn",onClick:()=>fileInputRef.current?.click()},"Импорт JSON"),
          React.createElement("input",{ref:fileInputRef,type:"file",accept:"application/json",style:{display:"none"},onChange:e=> e.target.files?.[0] && importJSON(e.target.files[0]) }),
          React.createElement("button",{className:"btn",onClick:async()=>{
            if(typeof Notification!=="undefined"){
              if(Notification.permission!=="granted"){ const p=await Notification.requestPermission(); if(p==="granted") setNotifEnabled(true);} else setNotifEnabled(true);
            }
          }}, notifEnabled? "Напоминания включены":"Включить напоминания")
        ),
        React.createElement("div",{className:"grid6",style:{marginTop:12}},
          ...Object.entries(reminderTimes).map(([key,val]) =>
            React.createElement("label",{key, className:"panel hstack", style:{justifyContent:"space-between"}},
              React.createElement("span",{style:{fontWeight:500}}, ({"morning":"Утро","pre-workout":"Перед тренировкой","post-workout":"После тренировки","evening":"Вечер","any":"В любое время"})[key] || key),
              React.createElement("input",{type:"time",className:"input",value:val,onChange:e=>setReminderTimes(rt=>({...rt,[key]:e.target.value}))})
            )
          )
        ),
        (function Panel(children, style){ return React.createElement("div",{className:"panel",style},children); })([
          React.createElement("div",{style:{fontWeight:600,marginBottom:8}},"Неделя: прогресс"),
          React.createElement("div",{className:"grid7"},
            ...weekDates.map(d=>{
              const rec=completed[d]||{habits:{},supps:{}};
              const total=habits.length + supps.length;
              const done=Object.values(rec.habits).filter(Boolean).length + Object.values(rec.supps).filter(Boolean).length;
              const pct = total? Math.round((done/total)*100):0;
              return React.createElement("div",{key:d,className:"card",style:{textAlign:"center"}},
                React.createElement("div",{className:"muted"}, d.slice(5)),
                React.createElement("div",{className:"progress",style:{marginTop:8}}, React.createElement("div",{style:{width:`${pct}%`}})),
                React.createElement("div",{className:"muted",style:{marginTop:4}}, `${pct}%`)
              );
            })
          )
        ],{marginTop:16}),
        React.createElement("div",{className:"split",style:{marginTop:16}},
          (function Panel(children, style){ return React.createElement("div",{className:"panel",style},children); })([
            React.createElement("div",{style:{fontWeight:600}},"Привычки"),
            React.createElement("div",{className:"list",style:{marginTop:8}},
              ...habits.map(h=> React.createElement("div",{key:h.id,className:"row card"},
                React.createElement("label",{className:"hstack"},
                  React.createElement("input",{type:"checkbox",checked:!!(completed[date]?.habits||{})[h.id],onChange:()=>toggleHabit(h.id)}),
                  React.createElement("div",null,
                    React.createElement("div",{style:{fontWeight:500}},h.name),
                    React.createElement("div",{className:"muted"},h.category)
                  )
                ),
                React.createElement("div",{className:"hstack"},
                  React.createElement("span",{className:"muted"},`🔥 Серия: ${(function getStreak(itemId){ let s=0; let dd=new Date(date); while(true){ const k=dd.toISOString().slice(0,10); const r=completed[k]; if(r && r.habits && r.habits[itemId]){ s++; dd.setDate(dd.getDate()-1);} else break;} return s;})(h.id)}`),
                  React.createElement("button",{className:"btn danger",onClick:()=>deleteHabit(h.id)},"Удалить")
                )
              ))
            ),
            React.createElement("div",{className:"card",style:{marginTop:12}},
              React.createElement("div",{className:"hstack",style:{flexWrap:"wrap"}},
                React.createElement("input",{className:"input",placeholder:"Название привычки",style:{flex:1,minWidth:180},value:newHabit.name,onChange:e=>setNewHabit(v=>({...v,name:e.target.value}))}),
                React.createElement("input",{className:"input",placeholder:"Категория (опц.)",style:{width:180},value:newHabit.category,onChange:e=>setNewHabit(v=>({...v,category:e.target.value}))}),
                React.createElement("button",{className:"btn primary",onClick:()=>{ const name=(newHabit.name||"").trim(); if(!name) return; const id = name.toLowerCase().replace(/[^a-zа-я0-9]+/gi,"-")+"-"+Math.random().toString(36).slice(2,6); setHabits(p=>[...p,{ id, name, category:newHabit.category||"Общее" }]); setNewHabit({ name:"", category:"Общее" }); }},"Добавить")
              )
            )
          ]),
          (function Panel(children, style){ return React.createElement("div",{className:"panel",style},children); })([
            React.createElement("div",{style:{fontWeight:600}},"БАДы"),
            ...TIMINGS.map(t =>
              React.createElement("div",{key:t.id,style:{marginTop:12}},
                React.createElement("div",{className:"muted",style:{fontWeight:600,fontSize:14}}, t.label),
                React.createElement("div",{className:"list",style:{marginTop:6}},
                  ...supps.filter(s => s.days==="daily" || (s.days==="workout"&&workoutDay) || (s.days==="rest"&&!workoutDay))
                    .filter(s => s.timing===t.id || ((t.id!=="pre-workout" && t.id!=="post-workout") && s.timing==="any"))
                    .map(s => React.createElement("div",{key:s.id,className:"row card"},
                      React.createElement("label",{className:"hstack"},
                        React.createElement("input",{type:"checkbox",checked:!!(completed[date]?.supps||{})[s.id],onChange:()=>toggleSupp(s.id)}),
                        React.createElement("div",null,
                          React.createElement("div",{style:{fontWeight:500}},s.name),
                          React.createElement("div",{className:"muted"}, `${s.dosage} • ${s.days==='daily'?'ежедневно':s.days==='workout'?'в трен. дни':'в дни отдыха'}${s.notes?` • ${s.notes}`:''}`)
                        )
                      ),
                      React.createElement("button",{className:"btn danger",onClick:()=>deleteSupp(s.id)},"Удалить")
                    ))
                )
              )
            ),
            React.createElement("div",{className:"card",style:{marginTop:12}},
              React.createElement("div",{className:"grid12"},
                React.createElement("input",{className:"input",placeholder:"Название",style:{gridColumn:"span 4"},value:newSupp.name,onChange:e=>setNewSupp(v=>({...v,name:e.target.value}))}),
                React.createElement("input",{className:"input",placeholder:"Дозировка",style:{gridColumn:"span 2"},value:newSupp.dosage,onChange:e=>setNewSupp(v=>({...v,dosage:e.target.value}))}),
                React.createElement("select",{className:"select",style:{gridColumn:"span 2"},value:newSupp.timing,onChange:e=>setNewSupp(v=>({...v,timing:e.target.value}))},
                  ...TIMINGS.map(tt=> React.createElement("option",{key:tt.id,value:tt.id},tt.label))
                ),
                React.createElement("select",{className:"select",style:{gridColumn:"span 2"},value:newSupp.days,onChange:e=>setNewSupp(v=>({...v,days:e.target.value}))},
                  React.createElement("option",{value:"daily"},"Ежедневно"),
                  React.createElement("option",{value:"workout"},"В трен. дни"),
                  React.createElement("option",{value:"rest"},"В дни отдыха")
                ),
                React.createElement("input",{className:"input",placeholder:"Заметка (опц.)",style:{gridColumn:"span 8"},value:newSupp.notes,onChange:e=>setNewSupp(v=>({...v,notes:e.target.value}))}),
                React.createElement("div",{style:{gridColumn:"span 4",display:"flex",gap:8}},
                  React.createElement("button",{className:"btn primary",onClick:()=>{ const name=(newSupp.name||"").trim(); if(!name) return; const id = name.toLowerCase().replace(/[^a-zа-я0-9]+/gi,"-")+"-"+Math.random().toString(36).slice(2,6); setSupps(p=>[...p,{ id, name, dosage:newSupp.dosage, timing:newSupp.timing, days:newSupp.days, notes:newSupp.notes }]); setNewSupp({ name:"", dosage:"", timing:"any", days:"daily", notes:"" }); }},"Добавить БАД")
                )
              )
            )
          ])
        ),
        (function Panel(children, style){ return React.createElement("div",{className:"panel",style},children); })([
          React.createElement("div",{style:{fontWeight:600,marginBottom:8}},"Статистика"),
          React.createElement("div",{className:"grid12",style:{alignItems:"end"}},
            React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:4}},
              React.createElement("label",{className:"muted"},"Тип"),
              React.createElement("select",{className:"select",value:statsType,onChange:e=>setStatsType(e.target.value)},
                React.createElement("option",{value:"supp"},"БАД"),
                React.createElement("option",{value:"habit"},"Привычка"),
                React.createElement("option",{value:"workout"},"Тренировки")
              )
            ),
            statsType!=="workout" && React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:4,gridColumn:"span 3"}},
              React.createElement("label",{className:"muted"},"Элемент"),
              React.createElement("select",{className:"select",value:statsItemId,onChange:e=>setStatsItemId(e.target.value)},
                ...(statsType==="supp"? supps: habits).map(it=> React.createElement("option",{key:it.id,value:it.id},it.name))
              )
            ),
            React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:4}},
              React.createElement("label",{className:"muted"},"Период"),
              React.createElement("select",{className:"select",value:statsPeriod,onChange:e=>setStatsPeriod(e.target.value)},
                React.createElement("option",{value:"week"},"Эта неделя"),
                React.createElement("option",{value:"month"},"Этот месяц"),
                React.createElement("option",{value:"year"},"Этот год"),
                React.createElement("option",{value:"custom"},"Произвольный")
              )
            ),
            statsPeriod==="custom" && React.createElement(React.Fragment,null,
              React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:4}},
                React.createElement("label",{className:"muted"},"С"),
                React.createElement("input",{type:"date",className:"input",value:customStart,onChange:e=>setCustomStart(e.target.value)})
              ),
              React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:4}},
                React.createElement("label",{className:"muted"},"По"),
                React.createElement("input",{type:"date",className:"input",value:customEnd,onChange:e=>setCustomEnd(e.target.value)})
              )
            )
          ),
          React.createElement("div",{className:"kpi",style:{marginTop:12}},
            React.createElement("div",{className:"card"}, React.createElement("div",{className:"muted"},"Дней в периоде"), React.createElement("div",{style:{fontWeight:700,fontSize:22}}, (stats.daysCount||0))),
            React.createElement("div",{className:"card"}, React.createElement("div",{className:"muted"}, (statsType==='workout'?'Тренировок':'Выполнено дней')), React.createElement("div",{style:{fontWeight:700,fontSize:22}}, (stats.doneDays || stats.workouts || 0))),
            React.createElement("div",{className:"card"}, React.createElement("div",{className:"muted"},"Процент выполнения"), React.createElement("div",{style:{fontWeight:700,fontSize:22}}, ((stats.rate??0)+"%"))),
            statsType==='supp' && React.createElement("div",{className:"card"}, React.createElement("div",{className:"muted"},"Суммарная дозировка"), React.createElement("div",{style:{fontWeight:700,fontSize:22}}, (stats.totalDose!=null? `${stats.totalDose} ${stats.unit||''}`: "—")))
          ),
          React.createElement("div", {style:{marginTop:12}},
            React.createElement("div",{style:{fontWeight:500,marginBottom:6,fontSize:14}},"Активность по дням"),
            React.createElement("div",{className:"grid12"},
              ...Object.keys(completed).sort().map(k => {
                const [s,e]=periodBounds(statsPeriod,date); if(!inRange(k,s,e)) return null;
                const rec=completed[k]; let ok=0; if(statsType==='workout') ok=rec?.workoutDay?1:0; else if(statsType==='habit') ok=rec?.habits?.[statsItemId]?1:0; else ok=rec?.supps?.[statsItemId]?1:0;
                return React.createElement("div",{key:k,className:"card",title:`${k}: ${ok?'✔':'—'}`,style:{height:20,background: ok? "var(--accent-2)": "var(--card)"}} );
              })
            )
          )
        ],{marginTop:16}),
        React.createElement("div",{className:"footer"},"Подсказка: можно «Установить приложение» на Android из меню Chrome, если сайт HTTPS и есть манифест+SW.")
      )
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
})();