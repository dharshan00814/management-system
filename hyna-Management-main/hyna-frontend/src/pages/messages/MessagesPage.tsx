import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { Globe, Send, Smile, Paperclip, FileText, X, Loader2, Hand, Check, Copy, Sparkles } from 'lucide-react';

const EMOJI_CATEGORIES = [
  {
    name: 'Smileys',
    emojis: ['😀', '😃', '😄', '😁', '😆', '🥹', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😋', '😜', '😎', '🤩', '🥳', '😏', '🧐', '🤓', '🤖'],
  },
  {
    name: 'Gestures',
    emojis: ['👍', '👎', '👌', '🤌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '✋', '👋', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '💪'],
  },
  {
    name: 'Vibes & Hearts',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❣️', '💕', '🔥', '✨', '⚡', '💥', '⭐', '🌟', '🚀', '🎉', '🎊', '💯'],
  },
  {
    name: 'Work & Tools',
    emojis: ['💻', '🖥️', '📱', '💡', '📝', '📋', '📌', '📍', '🎯', '🏆', '🥇', '📊', '📈', '📉', '📁', '📂', '🔒', '🔑', '☕', '🍕', '⏰'],
  },
];
import { Avatar, LoadingState } from '@/components/ui';
import { cn, formatRelativeTime, formatFileSize } from '@/lib/utils';
import { useAuthStore } from '@/stores';
import { getChannelMessages, sendMessage, getUsers, updateMessageReactions } from '@/services/api';
import type { ChatMessage, User } from '@/types';
import { supabase } from '@/lib/supabase';

export function MessagesPage() {
  const { currentUser } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [activeChat, setActiveChat] = useState<string>('globe');
  const [newMessage, setNewMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<{ name: string; path: string; type: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const teamMembers = users;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const usrs = await getUsers();
        if (isMounted) {
          // Exclude the currently logged-in user from the direct messages list
          setUsers(usrs.filter(u => u.id !== currentUser?.id));
        }
      } catch (err) {
        console.error('Failed to load chat data:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, [currentUser]);

  const handleCopy = (msg: ChatMessage) => {
    navigator.clipboard.writeText(msg.content);
    setCopiedMessageId(msg.id);
    toast.success('Message copied to clipboard');
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!currentUser?.id) return;
    let updatedReactions: any[] = [];
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      let reactions = [...(m.reactions || [])];
      const existing = reactions.find(r => r.emoji === emoji);
      if (existing) {
        if (existing.userIds.includes(currentUser.id)) {
          existing.userIds = existing.userIds.filter(id => id !== currentUser.id);
        } else {
          existing.userIds.push(currentUser.id);
        }
      } else {
        reactions.push({ emoji, userIds: [currentUser.id] });
      }
      updatedReactions = reactions.filter(r => r.userIds.length > 0);
      return { ...m, reactions: updatedReactions };
    }));

    if (messageId && !messageId.startsWith('temp-')) {
      updateMessageReactions(messageId, updatedReactions).catch(() => {});
    }
  };

  // Load messages & subscribe to realtime changes
  useEffect(() => {
    let isMounted = true;
    if (!activeChat || !currentUser?.id) return;

    const fetchMessages = async () => {
      try {
        const msgs = await getChannelMessages(activeChat, currentUser.id);
        if (isMounted) setMessages(msgs);
      } catch (err) {
        console.error(err);
      }
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 3000); // 3-second fetch interval for real-time feel

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeChat, currentUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeChat]);

  const handleSend = async () => {
    if ((!newMessage.trim() && pendingAttachments.length === 0) || !activeChat || !currentUser?.id) return;
    const text = newMessage.trim();
    const currentAttachments = [...pendingAttachments];
    
    // OPTIMISTIC UI: create a temporary message
    const tempMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      channelId: activeChat,
      senderId: currentUser.id,
      content: text,
      timestamp: new Date().toISOString(),
      type: currentAttachments.length > 0 && !text ? 'file' : 'text',
      attachments: currentAttachments,
      reactions: [],
    };
    
    // Immediately update UI and clear input
    setMessages(prev => [...prev, tempMessage]);
    setNewMessage('');
    setPendingAttachments([]);
    setShowEmojiPicker(false);
    
    try {
      const sent = await sendMessage(activeChat, text, currentUser.id, currentAttachments);
      // Replace the temp message with the real one returned from DB
      setMessages(prev => prev.map(m => m.id === tempMessage.id ? sent : m));
    } catch (err: any) {
      console.error('Failed to send message:', err);
      // Revert Optimistic UI
      setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
      setNewMessage(text); // Put text back into input
      setPendingAttachments(currentAttachments); // Restore attachments
      toast.error(err?.message || 'Failed to send message to database.');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const uploaded = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const filePath = `chat-attachments/${fileName}`;

      try {
        const { error } = await supabase.storage.from('files').upload(filePath, file, { upsert: true });
        if (error) throw error;

        let type = 'document';
        if (file.type.startsWith('image/')) type = 'image';
        else if (file.type.startsWith('video/')) type = 'video';

        uploaded.push({ name: file.name, path: filePath, type });
      } catch (err: any) {
        console.error('Error uploading attachment:', err);
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    setPendingAttachments(prev => [...prev, ...uploaded]);
    setIsUploading(false);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removePendingAttachment = (index: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleInsertEmoji = (emoji: string) => {
    setNewMessage(prev => {
      const nextStr = prev + emoji;
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const length = nextStr.length;
          inputRef.current.setSelectionRange(length, length);
        }
      }, 0);
      return nextStr;
    });
  };

  const activeUser = users.find(u => u.id === activeChat);

  if (isLoading) return <LoadingState />;

  return (
    <div className="page-container !p-0 sm:!p-6">
      <div className="card overflow-hidden h-[calc(100vh-8rem)] sm:h-[calc(100vh-10rem)] flex animate-fade-in">
        {/* Channel sidebar */}
        <div className="w-64 border-r border-[var(--color-border)] hidden md:flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-[var(--color-border)]">
            <h2 className="text-sm font-semibold">Messages</h2>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            <div className="px-3 py-1 text-[11px] font-medium text-[var(--color-muted-foreground)] uppercase tracking-wider">Public</div>
            <button
              onClick={() => setActiveChat('globe')}
              className={cn(
                'flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors rounded-md mx-1',
                activeChat === 'globe' ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium' : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]',
              )}
              style={{ width: 'calc(100% - 8px)' }}
            >
              <Globe className="w-4 h-4 shrink-0" />
              <span className="truncate">Globe Chat</span>
            </button>

            <div className="px-3 py-1 mt-3 text-[11px] font-medium text-[var(--color-muted-foreground)] uppercase tracking-wider">Direct Messages</div>
            {users.map(user => (
              <button
                key={user.id}
                onClick={() => setActiveChat(user.id)}
                className={cn(
                  'flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors rounded-md mx-1',
                  activeChat === user.id ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium' : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]',
                )}
                title="Toggle Team Roster"
              >
                <Avatar name={user.name} src={user.avatar} size="xs" />
                <span className="truncate">{user.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Channel header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)] shrink-0">
            {/* Mobile channel selector */}
            <select
              value={activeChat}
              onChange={(e) => setActiveChat(e.target.value)}
              className="md:hidden h-8 px-2 rounded border border-[var(--color-input)] bg-[var(--color-background)] text-sm"
            >
              <option value="globe">Globe Chat</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <div className="hidden md:block">
              {activeChat === 'globe' ? (
                <>
                  <h3 className="text-sm font-semibold flex items-center gap-1.5"><Globe className="w-4 h-4 text-[var(--color-muted-foreground)]" /> Globe Chat</h3>
                  <p className="text-xs text-[var(--color-muted-foreground)]">All workspace members</p>
                </>
              ) : (
                <>
                  <h3 className="text-sm font-semibold">{activeUser?.name || 'Member'}</h3>
                  <p className="text-xs text-[var(--color-muted-foreground)]">{activeUser?.role || 'Direct Message'}</p>
                </>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12 text-sm text-[var(--color-muted-foreground)] flex items-center justify-center gap-2">
                No messages yet. Say hello! <Hand className="w-4 h-4 text-yellow-500" />
              </div>
            ) : (
              messages.map(msg => {
                // Find sender in users array, or if it's our own message, use currentUser context
                const sender = users.find(u => u.id === msg.senderId) || (currentUser?.id === msg.senderId ? currentUser : null);
                const isOwn = msg.senderId === currentUser?.id;
                const senderName = isOwn ? (currentUser?.name || 'You') : (sender?.name || 'Team Member');
                const senderRole = isOwn ? (currentUser?.role || 'member') : (sender?.role || 'member');
                const senderDesignation = isOwn ? (currentUser?.designation || '') : (sender?.designation || '');

                return (
                  <div key={msg.id} className={cn('flex gap-3', isOwn && 'flex-row-reverse')}>
                    <Avatar name={sender?.name || 'User'} src={sender?.avatar} size="sm" />
                    <div className={cn('max-w-[70%]', isOwn && 'text-right')}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium">{sender?.name || 'User'}</span>
                        <span className="text-[11px] text-[var(--color-muted-foreground)]">{formatRelativeTime(msg.timestamp)}</span>
                      </div>
                      <div className={cn(
                        'inline-block px-3 py-2 rounded-xl text-sm text-left',
                        isOwn ? 'bg-[var(--color-primary)] text-white rounded-tr-sm' : 'bg-[var(--color-muted)] rounded-tl-sm',
                      )}>
                        {msg.content}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="mt-1 flex flex-col gap-1">
                            {msg.attachments.map((att, i) => (
                              <AttachmentRenderer key={i} attachment={att} isOwn={isOwn} />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Reactions bar */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className={cn('flex flex-wrap gap-1 mt-1.5', isOwn && 'justify-end')}>
                          {msg.reactions.map((react, rIdx) => {
                            const hasReacted = currentUser?.id ? react.userIds.includes(currentUser.id) : false;
                            return (
                              <button
                                key={rIdx}
                                onClick={() => handleReaction(msg.id, react.emoji)}
                                className={cn(
                                  'h-5 px-1.5 rounded-full text-xs flex items-center gap-1 border transition-colors',
                                  hasReacted 
                                    ? 'bg-[var(--color-primary)]/15 border-[var(--color-primary)]/40 text-[var(--color-primary)] font-semibold' 
                                    : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]'
                                )}
                              >
                                <span>{react.emoji}</span>
                                <span className="text-[10px]">{react.userIds.length}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Hover action toolbar */}
                    <div
                      className={cn(
                        'opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-[var(--color-card)] border border-[var(--color-border)] shadow-md rounded-lg p-1 absolute top-2',
                        isOwn ? 'left-4' : 'right-4'
                      )}
                    >
                      <button
                        onClick={() => handleReaction(msg.id, '👍')}
                        className="p-1 rounded hover:bg-[var(--color-muted)] text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                        title="React 👍"
                      >
                        👍
                      </button>
                      <button
                        onClick={() => handleReaction(msg.id, '❤️')}
                        className="p-1 rounded hover:bg-[var(--color-muted)] text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                        title="React ❤️"
                      >
                        ❤️
                      </button>
                      <button
                        onClick={() => handleReaction(msg.id, '🚀')}
                        className="p-1 rounded hover:bg-[var(--color-muted)] text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                        title="React 🚀"
                      >
                        🚀
                      </button>
                      <button
                        onClick={() => handleReaction(msg.id, '🔥')}
                        className="p-1 rounded hover:bg-[var(--color-muted)] text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                        title="React 🔥"
                      >
                        🔥
                      </button>
                      <div className="w-px h-3 bg-[var(--color-border)] mx-0.5" />
                      <button
                        onClick={() => handleCopy(msg)}
                        className="p-1 rounded hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                        title="Copy message"
                      >
                        {copiedMessageId === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Pending Attachments */}
          {pendingAttachments.length > 0 && (
            <div className="px-4 py-2 border-t border-[var(--color-border)] bg-[var(--color-muted)]/20 flex gap-2 overflow-x-auto">
              {pendingAttachments.map((att, i) => (
                <div key={i} className="flex items-center gap-2 bg-[var(--color-background)] border border-[var(--color-border)] p-1.5 pr-2 rounded-md shrink-0">
                  <FileText className="w-4 h-4 text-blue-500" />
                  <span className="text-xs truncate max-w-[120px]">{att.name}</span>
                  <button onClick={() => removePendingAttachment(i)} className="p-0.5 rounded-full hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-red-500 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Message input */}
          <div className="px-4 py-3 border-t border-[var(--color-border)] relative">
            {isUploading && (
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500/20 overflow-hidden">
                <div className="h-full bg-blue-500 animate-pulse" style={{ width: '100%' }} />
              </div>
            )}
            <div className="flex items-center gap-2">
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="p-2 rounded-lg text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors disabled:opacity-50"
              >
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              </button>
              <input
                type="file"
                multiple
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileSelect}
              />
              <input
                ref={inputRef}
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault(); // Prevent accidental form submissions or default behavior
                    handleSend();
                  }
                }}
                placeholder={activeChat === 'globe' ? "Message Globe Chat..." : `Message ${activeUser?.name || '...'}`}
                className="flex-1 h-9 px-3 rounded-lg border border-[var(--color-input)] bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
              />
              <div className="relative">
                <button 
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="p-2 rounded-lg text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors"
                  title="Add emoji"
                >
                  <Smile className="w-4 h-4" />
                </button>
                {showEmojiPicker && (
                  <div className="absolute bottom-12 right-0 z-50 w-72 max-h-72 overflow-y-auto bg-[var(--color-card)] border border-[var(--color-border)] rounded-2xl shadow-2xl p-3 animate-slide-up">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--color-border)]">
                      <span className="text-xs font-semibold text-[var(--color-foreground)]">Emoji Palette</span>
                      <button
                        type="button"
                        onClick={() => setShowEmojiPicker(false)}
                        className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] p-0.5 rounded cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="space-y-2.5">
                      {EMOJI_CATEGORIES.map(category => (
                        <div key={category.name}>
                          <p className="text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider mb-1 px-1">{category.name}</p>
                          <div className="grid grid-cols-6 gap-1">
                            {category.emojis.map(emoji => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => handleInsertEmoji(emoji)}
                                className="w-8 h-8 rounded-lg hover:bg-[var(--color-muted)] text-base flex items-center justify-center transition-transform hover:scale-125 cursor-pointer"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleSend}
                disabled={(typeof newMessage === 'string' && !newMessage.trim() && pendingAttachments.length === 0) || isUploading}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  (newMessage.trim() || pendingAttachments.length > 0) && !isUploading ? 'text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10' : 'text-[var(--color-muted-foreground)]',
                )}
                title="Send message (Enter)"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between px-2 pt-1.5 text-[10px] text-[var(--color-muted-foreground)]">
              <span>Press <kbd className="px-1 py-0.5 rounded bg-[var(--color-muted)] font-mono text-[9px]">Enter</kbd> to send, <kbd className="px-1 py-0.5 rounded bg-[var(--color-muted)] font-mono text-[9px]">Shift + Enter</kbd> for newline</span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live synchronized
              </span>
            </div>
          </div>
        </div>

        {/* Collapsible Studio Team Roster Side Panel */}
        {showMembersPanel && (
          <div className="w-72 border-l border-[var(--color-border)] bg-[var(--color-card)] hidden lg:flex flex-col shrink-0 animate-fade-in">
            {/* Panel Header */}
            <div className="px-4 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  Studio Team ({teamMembers.length})
                </h3>
              </div>
              <button
                onClick={() => setShowMembersPanel(false)}
                className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] p-1 rounded-md"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Members List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1 divide-y divide-[var(--color-border)]/20">
              {teamMembers.map(member => {
                const isCurrentUser = member.id === currentUser?.id;
                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-[var(--color-muted)]/50 transition-colors group"
                  >
                    <div className="relative shrink-0">
                      <Avatar name={member.name} size="md" />
                      <div 
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--color-card)]',
                          member.status === 'active' || isCurrentUser ? 'bg-emerald-500' : 'bg-slate-400'
                        )}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold truncate text-[var(--color-foreground)]">
                          {member.name}
                        </span>
                        {isCurrentUser && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-[var(--color-primary)]/15 text-[var(--color-primary)] font-medium">
                            You
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--color-muted-foreground)] truncate">
                        {member.designation || member.department || 'Engineer'}
                      </p>
                    </div>

                    {member.role === 'admin' ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-purple-500/10 text-purple-400">
                        ADMIN
                      </span>
                    ) : member.role === 'manager' ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-500/10 text-amber-400">
                        MGR
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* Quick Studio Info Footer */}
            <div className="p-3 border-t border-[var(--color-border)] bg-[var(--color-muted)]/20 text-center">
              <p className="text-[11px] text-[var(--color-muted-foreground)] flex items-center justify-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span>All team members share this room</span>
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

const AttachmentRenderer = ({ attachment, isOwn }: { attachment: { name: string; path: string; type: string; url?: string }, isOwn: boolean }) => {
  const [url, setUrl] = useState<string | null>(attachment.url || null);

  useEffect(() => {
    let isMounted = true;
    if (!url) {
      const fetchUrl = async () => {
        try {
          const { data, error } = await supabase.storage.from('files').createSignedUrl(attachment.path, 3600);
          if (error) throw error;
          if (data?.signedUrl && isMounted) setUrl(data.signedUrl);
        } catch (err) {
          console.error('Failed to get signed URL for attachment', err);
        }
      };
      fetchUrl();
    }
    return () => { isMounted = false; };
  }, [attachment.path, url]);

  if (!url) {
    return (
      <div className={cn("flex items-center gap-2 p-2 mt-2 rounded-md border w-fit", isOwn ? "bg-white/10 border-white/20" : "bg-[var(--color-muted)]/50 border-[var(--color-border)]")}>
        <Loader2 className={cn("w-3 h-3 animate-spin", isOwn ? "text-white/70" : "text-[var(--color-muted-foreground)]")} />
        <span className={cn("text-xs", isOwn ? "text-white/70" : "text-[var(--color-muted-foreground)]")}>Loading...</span>
      </div>
    );
  }

  if (attachment.type === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block mt-2">
        <img src={url} alt={attachment.name} className="max-w-[200px] max-h-[200px] rounded-md border border-white/20 object-cover shadow-sm" />
      </a>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className={cn(
      "flex items-center gap-2 p-2 mt-2 rounded-md border transition-colors w-fit",
      isOwn ? "bg-white/10 border-white/20 hover:bg-white/20 text-white" : "bg-[var(--color-background)] border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-foreground)]"
    )}>
      <FileText className={cn("w-4 h-4 shrink-0", isOwn ? "text-white" : "text-blue-500")} />
      <span className="text-xs truncate max-w-[150px]">{attachment.name}</span>
    </a>
  );
};
