import React, { useState, useEffect } from 'react';

export default function CleanChatUI({ socket }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('searching'); // 'searching' | 'connected'
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (!socket) return;

    // Direct Stranger Match (No AI indicator)
    socket.on('match_found', (data) => {
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
      setMessages((prev) => [...prev, { sender: 'system', text: 'Stranger has disconnected.' }]);
    });

    return () => {
      socket.off('match_found');
      socket.off('bot_typing');
      socket.off('receive_bot_message');
      socket.off('partner_disconnected');
    };
  }, [socket]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim() || status !== 'connected') return;

    const userMsg = input.trim();
    const updatedMessages = [...messages, { sender: 'user', text: userMsg }];
    setMessages(updatedMessages);
    setInput('');

    // Format for server/bot handling
    const formattedHistory = updatedMessages
      .filter((m) => m.sender !== 'system')
      .map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));

    socket.emit('send_bot_message', { messages: formattedHistory });
  };

  return (
    <div className="flex flex-col h-screen bg-[#0e0f12] text-gray-200 font-sans">
      {/* Top Header - No AI Badges / No Milo */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-[#121418]">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${status === 'connected' ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
          <span className="font-semibold text-lg text-white">
            {status === 'connected' ? 'Stranger' : 'Looking for a stranger...'}
          </span>
        </div>
        <button 
          onClick={() => { setStatus('searching'); socket.emit('find_partner'); }}
          className="px-4 py-1.5 text-sm bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-600/30 transition"
        >
          Disconnect
        </button>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-y-auto p-6 space-y-4 max-w-4xl mx-auto w-full">
        {status === 'searching' && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 space-y-3">
            <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            <p className="text-sm">Matching you with someone online...</p>
          </div>
        )}

        {messages.map((msg, index) => {
          if (msg.sender === 'system') {
            return (
              <div key={index} className="text-center text-xs text-gray-500 my-2">
                {msg.text}
              </div>
            );
          }
          const isUser = msg.sender === 'user';
          return (
            <div key={index} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              <span className="text-[10px] text-gray-500 mb-1 px-1">{isUser ? 'You' : 'Stranger'}</span>
              <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                isUser 
                  ? 'bg-indigo-600 text-white rounded-br-none' 
                  : 'bg-[#1e2229] text-gray-100 rounded-bl-none border border-gray-800'
              }`}>
                {msg.text}
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex items-center gap-1.5 text-gray-400 text-xs pl-2">
            <span>Stranger is typing</span>
            <span className="animate-bounce">.</span>
            <span className="animate-bounce delay-100">.</span>
            <span className="animate-bounce delay-200">.</span>
          </div>
        )}
      </main>

      {/* Input Bar - Clean & Minimal */}
      <footer className="p-4 border-t border-gray-800 bg-[#121418]">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={status !== 'connected'}
            placeholder={status === 'connected' ? 'Type a message...' : 'Waiting for connection...'}
            className="flex-1 bg-[#1a1d24] text-white border border-gray-700/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={status !== 'connected' || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl text-sm font-medium transition disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </footer>
    </div>
  );
}
