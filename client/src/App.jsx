import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://rcapp-server.onrender.com';
const socket = io(BACKEND_URL, { autoConnect: true });

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('searching');
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    socket.emit('find_partner');

    socket.on('match_found', () => {
      setStatus('connected');
      setMessages([{ sender: 'system', text: 'You are now connected with a random stranger. Say hi!' }]);
    });

    socket.on('bot_typing', ({ isTyping }) => {
      setIsTyping(isTyping);
    });

    socket.on('receive_bot_message', (data) => {
      setMessages((prev) => [...prev, { sender: 'stranger', text: data.text }]);
    });

    socket.on('partner_disconnected', () => {
      setStatus('searching');
      setMessages([{ sender: 'system', text: 'Stranger disconnected. Looking for a new match...' }]);
      socket.emit('find_partner');
    });

    return () => {
      socket.off('match_found');
      socket.off('bot_typing');
      socket.off('receive_bot_message');
      socket.off('partner_disconnected');
    };
  }, []);

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim() || status !== 'connected') return;

    const userMsg = input.trim();
    const updatedMessages = [...messages, { sender: 'user', text: userMsg }];
    setMessages(updatedMessages);
    setInput('');

    const formattedHistory = updatedMessages
      .filter((m) => m.sender !== 'system')
      .map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));

    socket.emit('send_bot_message', { messages: formattedHistory });
  };

  const handleNext = () => {
    setStatus('searching');
    setMessages([]);
    socket.emit('cancel_search');
    socket.emit('find_partner');
  };

  return (
    <div className="flex flex-col h-screen bg-[#0d0e11] text-gray-200 font-sans">
      {/* Top Bar - No AI / No Milo */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-[#12141a]">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${status === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-amber-500 animate-pulse'}`} />
          <span className="font-semibold text-base text-gray-100">
            {status === 'connected' ? 'Stranger' : 'Looking for someone...'}
          </span>
        </div>
        <button 
          onClick={handleNext}
          className="px-4 py-2 text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-lg transition"
        >
          {status === 'connected' ? 'Skip / Next' : 'Searching...'}
        </button>
      </header>

      {/* Main Chat Log */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 max-w-3xl mx-auto w-full">
        {status === 'searching' && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 space-y-3">
            <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            <p className="text-xs font-medium tracking-wide">Connecting you to a stranger...</p>
          </div>
        )}

        {messages.map((msg, index) => {
          if (msg.sender === 'system') {
            return (
              <div key={index} className="text-center text-[11px] text-gray-500 my-3 font-mono">
                --- {msg.text} ---
              </div>
            );
          }
          const isUser = msg.sender === 'user';
          return (
            <div key={index} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              <span className="text-[10px] text-gray-500 mb-1 px-1 font-medium">{isUser ? 'You' : 'Stranger'}</span>
              <div className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm leading-relaxed ${
                isUser 
                  ? 'bg-indigo-600 text-white rounded-br-xs' 
                  : 'bg-[#181b22] text-gray-100 rounded-bl-xs border border-gray-800'
              }`}>
                {msg.text}
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex items-center gap-1.5 text-gray-500 text-xs pl-1">
            <span>Stranger is typing</span>
            <span className="animate-pulse">...</span>
          </div>
        )}
      </main>

      {/* Message Input */}
      <footer className="p-4 border-t border-gray-800 bg-[#12141a]">
        <form onSubmit={handleSend} className="max-w-3xl mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={status !== 'connected'}
            placeholder={status === 'connected' ? 'Type your message...' : 'Connecting...'}
            className="flex-1 bg-[#181b22] text-white border border-gray-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={status !== 'connected' || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-xl text-sm font-medium transition disabled:opacity-30"
          >
            Send
          </button>
        </form>
      </footer>
    </div>
  );
}
