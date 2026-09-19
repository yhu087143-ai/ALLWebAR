import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, X, Bot, User, ChevronRight } from 'lucide-react';

const SUGGESTIONS = {
  game: [
    { label: '查看规则', prompt: '显示当前所有规则' },
    { label: '加计分规则', prompt: '添加一个分数达到500时触发双倍分数的规则' },
    { label: '加计时规则', prompt: '添加一个剩余10秒时播放特效的规则' },
    { label: '改时长', prompt: '将游戏时长改为90秒' },
  ],
  guide: [
    { label: '查看POI', prompt: '显示当前所有兴趣点' },
    { label: '加POI', prompt: '添加一个名为"出口"的POI，描述为"从这里离开"，GPS坐标31.24,121.48' },
    { label: '改触发半径', prompt: '将所有POI的触发半径改为50米' },
    { label: '改描述', prompt: '将路线描述改为"校园导览路线"' },
  ],
  experience: [
    { label: '添加规则', prompt: '添加一条当分数超过200时播放庆祝特效的规则' },
    { label: '加计时机制', prompt: '启用计时器，限时120秒倒计时' },
    { label: '加导览路线', prompt: '添加3个POI：大门、图书馆、食堂，GPS坐标依次为(30.30,120.08),(30.31,120.09),(30.29,120.07)' },
    { label: '自由表达式', prompt: '添加一条规则使用表达式：当分数大于100且连击大于等于3时显示消息"太棒了！"' },
    { label: '加收集机制', prompt: '启用物品收集，共20个物品，每2秒生成一个' },
    { label: '全清', prompt: '删除所有规则，清空配置重新开始' },
  ],
  ui: [
    { label: '设计UI界面', prompt: '帮我设计一个完整的AR界面，包含分数、计时器和POI卡片，使用霓虹风格' },
    { label: '换主题', prompt: '把UI主题改成科幻霓虹风格' },
    { label: '绿色自然主题', prompt: '把UI改成自然的绿色主题，适合户外导览' },
    { label: '添加计时器', prompt: '在界面中添加一个计时器组件，放到顶部居中' },
    { label: '分数放右下角', prompt: '把分数显示移到右下角' },
    { label: '加POI列表', prompt: '添加一个POI列表组件，显示所有兴趣点' },
    { label: 'UI 建议', prompt: '根据当前配置，推荐最合适的UI布局和主题' },
  ],
};

export default function AiChatPanel({ config, context, onConfigChange, onClose }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: `你好！我是 AR 配置助手。你可以对我说自然语言指令来修改${context === 'guide' ? '导览' : context === 'experience' ? 'AR 体验' : context === 'ui' ? 'UI 界面' : '游戏'}配置。` },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text) => {
    const userMsg = text || input;
    if (!userMsg.trim() || loading) return;

    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.trim(),
          config,
          context: context || 'game',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '请求失败');
      }

      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);

      // Apply config changes if returned
      if (data.modifiedConfig && onConfigChange) {
        onConfigChange(data.modifiedConfig);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `抱歉，出错了：${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = SUGGESTIONS[context] || SUGGESTIONS.game;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500/20 to-rose-500/10 flex items-center justify-center">
            <Sparkles size={14} className="text-violet-400" />
          </div>
          <span className="text-sm font-medium text-slate-200">AI 助手</span>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all text-slate-500 hover:text-slate-300"
        >
          <X size={14} />
        </button>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex items-start gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
              msg.role === 'user' ? 'bg-violet-500/20' : 'bg-violet-500/20'
            }`}>
              {msg.role === 'user' ? (
                <User size={12} className="text-violet-400" />
              ) : (
                <Bot size={12} className="text-violet-400" />
              )}
            </div>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'bg-violet-500/10 text-violet-200 border border-violet-500/20'
                : 'bg-white/5 text-slate-300 border border-white/10'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
              <Bot size={12} className="text-violet-400" />
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-violet-400/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-violet-400/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-violet-400/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {/* Suggestions (only show at start) */}
        {messages.length === 1 && !loading && (
          <div className="pt-2">
            <p className="text-[10px] text-slate-600 mb-2">快速操作：</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s.prompt)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] bg-white/[0.03] border border-white/[0.06] text-slate-400 hover:bg-white/[0.06] hover:text-slate-300 transition-all"
                >
                  <ChevronRight size={10} />
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-white/10">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder={`输入指令修改${context === 'guide' ? '导览' : context === 'experience' ? 'AR 体验' : context === 'ui' ? 'UI 界面' : '游戏'}配置...`}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600 outline-none focus:border-violet-500/30 focus:ring-1 focus:ring-violet-500/20 transition-all"
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="px-3 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-rose-600 text-white text-xs font-medium hover:from-violet-400 hover:to-rose-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
