// ============================================================
// Hyna Studio Management - In-Meeting Real-Time Chat Drawer
// Realtime Messaging + Sender Badges + Message Timeline
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Smile } from 'lucide-react';
import { Avatar, Button } from '@/components/ui';
import type { MeetingChatMessage } from '@/types/meeting';

export interface MeetingChatProps {
  messages: MeetingChatMessage[];
  currentUserId: string;
  onSendMessage: (text: string) => void;
  onClose: () => void;
}

export function MeetingChat({
  messages,
  currentUserId,
  onSendMessage,
  onClose,
}: MeetingChatProps) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  return (
    <div className="w-80 h-full bg-[#141419] border-l border-white/10 flex flex-col z-20 shadow-2xl">
      {/* Chat Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm text-white">Meeting Chat</h3>
          <p className="text-[11px] text-white/50">Messages visible to all participants</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Message History */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <p className="text-xs text-white/40">No messages yet.</p>
            <p className="text-[11px] text-white/30 mt-1">Send a message to start the discussion.</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.senderId === currentUserId;
            const timeStr = msg.timestamp
              ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '';

            return (
              <div
                key={`${msg.id || 'msg'}-${index}`}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                {!isMe && (
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <Avatar
                      name={msg.senderName}
                      src={msg.senderAvatar}
                      className="w-4 h-4 text-[9px]"
                    />
                    <span className="text-[11px] font-medium text-white/70">
                      {msg.senderName}
                    </span>
                    <span className="text-[10px] text-white/40">
                      {timeStr}
                    </span>
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed break-words ${
                    isMe
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : 'bg-white/10 text-white/90 rounded-tl-none border border-white/5'
                  }`}
                >
                  {msg.message}
                </div>

                {isMe && (
                  <span className="text-[10px] text-white/40 mt-1 px-1">
                    {timeStr}
                  </span>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Box */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-white/10 bg-[#101014]">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Type a message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-white/40 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2 rounded-xl bg-white text-black hover:bg-white/90 disabled:opacity-40 disabled:hover:bg-white transition-all flex items-center justify-center shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
