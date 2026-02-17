const socket = io();

socket.on('connect', () => {
    if (window.currentUserId) {
        socket.emit('join', window.currentUserId);
    }
});

// Global notification handling
socket.on('notification', (data) => {
    try {
        console.log('Notification received:', data);

        // Play subtle professional notification sound
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
        audio.volume = 0.4;
        audio.play().catch(e => console.log('Audio play blocked by browser policy until user interaction.'));
        
        // 1. Identify current page context
        const pathname = window.location.pathname;
        const pathParts = pathname.split('/');
        const isChatSection = pathParts[1] === 'chat';
        const chattingWithId = (isChatSection && pathParts[2]) ? pathParts[2] : null;

        // 2. LIVE UPDATES (Always run, even if toast is hidden)
        
        // Update unread badges (Header & Sidebar Profile)
        const updateBadges = (elementId) => {
            const el = document.getElementById(elementId);
            if (el && chattingWithId !== data.senderId) {
                const current = parseInt(el.innerText) || 0;
                el.innerText = current + 1;
                el.style.display = 'flex';
            }
        };

        updateBadges('global-unread-count');
        updateBadges('side-unread-count');

        // Update Sidebar List if on Chat Page ( WhatsApp Style reordering )
        if (isChatSection) {
            const sidebarItem = document.getElementById(`sidebar-user-${data.senderId}`);
            const conversationList = document.querySelector('.conversation-list');
            if (sidebarItem && conversationList) {
                // Update text preview
                const lastMsgEl = sidebarItem.querySelector('.last-msg-text');
                if (lastMsgEl) lastMsgEl.innerText = data.content;
                
                // Show dot badge if not currently chatting with them
                if (chattingWithId !== data.senderId) {
                    const dotBadge = document.getElementById(`dot-${data.senderId}`);
                    if (dotBadge) {
                        dotBadge.style.display = 'flex';
                        const count = parseInt(dotBadge.innerText) || 0;
                        dotBadge.innerText = count + 1;
                    }
                }
                // Move to top like WhatsApp
                conversationList.prepend(sidebarItem);
            }
        }

        // 3. TOAST HANDLING (Decide if we show the floating pop-up)
        
        // CRITICAL: If the message section is open, we do NOT show the message pop-up 
        // because the user already sees the updates in the sidebar/chat window.
        if (isChatSection && data.type === 'message') {
            console.log('User is in message section, suppressing toast for message.');
            return; 
        }

        // Also skip if we are already viewing this specific chat (already handled by block above, but for safety)
        if (chattingWithId === data.senderId) return;

        const isSystemEvent = ['booking', 'cancel', 'payment'].includes(data.type);
        const toast = document.getElementById('msg-notification');
        
        if (toast) {
            const senderEl = document.getElementById('notif-sender');
            const contentEl = document.getElementById('notif-content');
            const linkEl = document.getElementById('notif-link');
            const refreshBtn = document.getElementById('notif-refresh');
            const iconContainer = document.getElementById('notif-icon-container');
            const progressBar = document.getElementById('notif-progress');

            senderEl.innerText = data.title || data.senderName || 'New Notification';
            contentEl.innerText = data.content || 'Click to view details';
            
            // Icon Styling
            if (data.type === 'booking') {
                iconContainer.style.background = 'linear-gradient(135deg, #10b981, #3b82f6)';
                iconContainer.innerHTML = '<i class="fas fa-rocket"></i>';
                progressBar.style.background = '#3b82f6';
            } else if (data.type === 'cancel') {
                iconContainer.style.background = 'linear-gradient(135deg, #ef4444, #b91c1c)';
                iconContainer.innerHTML = '<i class="fas fa-ban"></i>';
                progressBar.style.background = '#ef4444';
            } else {
                iconContainer.style.background = 'linear-gradient(135deg, var(--primary), #4f46e5)';
                const initial = (data.senderName || 'N').charAt(0).toUpperCase();
                iconContainer.innerHTML = `<span style="font-weight: 800;">${initial}</span>`;
                progressBar.style.background = 'var(--primary)';
            }

            // Refresh & Link handling
            if (refreshBtn) {
                const needsRefresh = isSystemEvent || (data.type === 'message' && !isChatSection);
                refreshBtn.style.display = needsRefresh ? 'flex' : 'none';
                if (needsRefresh && window.location.pathname.includes('dashboard')) {
                    setTimeout(() => window.location.reload(), 8000); 
                }
            }

            linkEl.href = data.senderId ? '/chat/' + data.senderId : '/chat';
            linkEl.innerText = data.senderId ? 'Reply Now' : 'View Inbox';

            // Animation
            const duration = isSystemEvent ? 7000 : 5000;
            progressBar.style.transition = 'none';
            progressBar.style.transform = 'scaleX(1)';
            toast.style.display = 'block';
            
            setTimeout(() => {
                toast.style.transform = 'translateX(0)';
                setTimeout(() => {
                    progressBar.style.transition = `transform ${duration}ms linear`;
                    progressBar.style.transform = 'scaleX(0)';
                }, 100);
            }, 10);

            if (window.notifTimeout) clearTimeout(window.notifTimeout);
            window.notifTimeout = setTimeout(() => closeNotification(), duration);
        }
    } catch (err) {
        console.error('Error handling notification:', err);
    }
});

// Immediately hide any active toast if the user is on the chat page
if (window.location.pathname.startsWith('/chat')) {
    setTimeout(closeNotification, 100);
}

// Auto-close toast if user navigates to the chat
window.addEventListener('popstate', () => {
    const pathParts = window.location.pathname.split('/');
    if (pathParts[1] === 'chat' && pathParts[2]) {
        closeNotification(); 
    }
});

function closeNotification() {
    const toast = document.getElementById('msg-notification');
    if (toast) {
        toast.style.transform = 'translateX(140%)';
        setTimeout(() => toast.style.display = 'none', 600);
    }
}

// Theme switcher logic ...
// Theme switcher logic
const toggleTheme = () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const targetTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', targetTheme);
    localStorage.setItem('theme', targetTheme);
};

// Initialize theme
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
