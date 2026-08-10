// Client-side AI Bot Socket Handler
export const initBotListeners = (socket, setMessages, setIsTyping, setIsBotMatched) => {
  socket.on('match_found', (data) => {
    if (data.isBot) {
      setIsBotMatched(true);
      setMessages([{ sender: 'system', text: 'You are now chatting with a random stranger. Say hi!' }]);
    }
  });

  socket.on('bot_typing', ({ isTyping }) => {
    setIsTyping(isTyping);
  });

  socket.on('receive_bot_message', (data) => {
    setMessages((prev) => [...prev, { sender: 'stranger', text: data.text }]);
  });
};

export const handleSendToBot = (socket, messageHistory, newText) => {
  const formattedHistory = messageHistory
    .filter(m => m.sender !== 'system')
    .map(m => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.text
    }));

  formattedHistory.push({ role: 'user', content: newText });

  socket.emit('send_bot_message', { messages: formattedHistory });
};
