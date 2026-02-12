/* PickleCue Interactive Demo — demo.js */

(function () {
    'use strict';

    // ─── State ───
    let currentTab = 'home';
    let leagueDetailOpen = false;
    let currentDetailTab = 'overview';

    // ─── Tab switching ───
    function showTab(tabId) {
        if (tabId === currentTab && !leagueDetailOpen) return;

        // Close league detail if open
        if (leagueDetailOpen) {
            closeLeagueDetail();
        }

        const screens = document.querySelectorAll('.screen');
        const tabs = document.querySelectorAll('.tab-item');

        screens.forEach(s => {
            s.classList.remove('active', 'prev');
        });

        tabs.forEach(t => t.classList.remove('active'));

        const next = document.getElementById('screen-' + tabId);
        const activeTab = document.querySelector('.tab-item[data-tab="' + tabId + '"]');

        if (next) {
            next.classList.add('active');
        }
        if (activeTab) {
            activeTab.classList.add('active');
        }

        currentTab = tabId;
    }

    // ─── League detail ───
    function openLeagueDetail(leagueIndex) {
        const detail = document.getElementById('league-detail');
        if (!detail) return;

        const leagues = getFakeLeagues();
        const league = leagues[leagueIndex] || leagues[0];

        // Populate header
        document.getElementById('league-detail-icon').textContent = league.icon;
        document.getElementById('league-detail-name').textContent = league.name;
        document.getElementById('league-detail-sub').textContent = league.details;

        detail.classList.add('open');
        leagueDetailOpen = true;

        // Show overview tab by default
        switchDetailTab('overview');
    }

    function closeLeagueDetail() {
        const detail = document.getElementById('league-detail');
        if (detail) {
            detail.classList.remove('open');
        }
        leagueDetailOpen = false;
    }

    function switchDetailTab(tabId) {
        currentDetailTab = tabId;

        document.querySelectorAll('.detail-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tabId);
        });

        document.querySelectorAll('.detail-content').forEach(c => {
            c.classList.toggle('active', c.id === 'dtab-' + tabId);
        });

        // Scroll chat to bottom on open
        if (tabId === 'chat') {
            setTimeout(scrollChatToBottom, 50);
        }
    }

    // ─── Chat with localStorage ───
    const CHAT_KEY = 'picklecue_demo_chat';

    function getStoredMessages() {
        try {
            const raw = localStorage.getItem(CHAT_KEY);
            if (raw) return JSON.parse(raw);
        } catch (_) { /* ignore */ }
        return null;
    }

    function saveMessages(messages) {
        try {
            localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
        } catch (_) { /* ignore */ }
    }

    function getDefaultMessages() {
        return [
            { sender: 'Mike K.', text: 'Hey team! Who\'s ready for Saturday\'s match?', me: false },
            { sender: 'Sarah L.', text: 'Count me in! Central Park at 10am right?', me: false },
            { sender: 'You', text: 'I\'ll be there. Should we warm up at 9:30?', me: true },
            { sender: 'Mike K.', text: 'Great idea. Let\'s do it!', me: false },
            { sender: 'James R.', text: 'I can bring extra balls and my portable net', me: false },
            { sender: 'You', text: 'Perfect, see everyone Saturday!', me: true },
        ];
    }

    function renderChat() {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        let messages = getStoredMessages();
        if (!messages) {
            messages = getDefaultMessages();
            saveMessages(messages);
        }

        container.innerHTML = messages.map(m => {
            if (m.me) {
                return '<div class="chat-msg me">' + escapeHtml(m.text) + '</div>';
            }
            return '<div class="chat-msg them"><div class="chat-sender">' +
                escapeHtml(m.sender) + '</div>' + escapeHtml(m.text) + '</div>';
        }).join('');

        scrollChatToBottom();
    }

    function sendChatMessage() {
        const input = document.getElementById('chat-input');
        if (!input) return;

        const text = input.value.trim();
        if (!text) return;

        let messages = getStoredMessages() || getDefaultMessages();
        messages.push({ sender: 'You', text: text, me: true });
        saveMessages(messages);

        input.value = '';
        renderChat();

        // Simulate reply after a short delay
        if (messages.length % 3 === 0) {
            setTimeout(function () {
                const replies = [
                    { sender: 'Mike K.', text: 'Sounds good!' },
                    { sender: 'Sarah L.', text: 'Love it!' },
                    { sender: 'James R.', text: 'Awesome, can\'t wait!' },
                    { sender: 'Mike K.', text: 'See you on the court!' },
                ];
                const reply = replies[Math.floor(Math.random() * replies.length)];
                messages.push({ sender: reply.sender, text: reply.text, me: false });
                saveMessages(messages);
                renderChat();
            }, 800 + Math.random() * 600);
        }
    }

    function scrollChatToBottom() {
        const container = document.getElementById('chat-messages');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ─── Fake data ───
    function getFakeLeagues() {
        return [
            { icon: '\uD83C\uDFC6', name: 'Summer Doubles League', details: '16 teams \u2022 Round Robin', status: 'Week 4 of 8', bg: '#FEF3C7' },
            { icon: '\uD83E\uDD47', name: '3.5 Ladder Challenge', details: '32 players \u2022 Ladder', status: 'Rank: #8', bg: '#E0E7FF' },
            { icon: '\uD83C\uDFAF', name: 'Mixed Doubles Open', details: '8 teams \u2022 Bracket', status: 'Registration Open', bg: '#D1FAE5' },
        ];
    }

    // ─── Init ───
    document.addEventListener('DOMContentLoaded', function () {
        // Tab bar clicks
        document.querySelectorAll('.tab-item').forEach(function (tab) {
            tab.addEventListener('click', function () {
                showTab(this.dataset.tab);
            });
        });

        // Welcome action clicks (navigate to tabs)
        document.querySelectorAll('[data-nav]').forEach(function (el) {
            el.addEventListener('click', function () {
                showTab(this.dataset.nav);
            });
        });

        // League card clicks
        document.querySelectorAll('.league-card').forEach(function (card, i) {
            card.addEventListener('click', function () {
                openLeagueDetail(i);
            });
        });

        // League detail back button
        var detailBack = document.getElementById('detail-back');
        if (detailBack) {
            detailBack.addEventListener('click', closeLeagueDetail);
        }

        // Detail tab clicks
        document.querySelectorAll('.detail-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                switchDetailTab(this.dataset.tab);
            });
        });

        // Chat send
        var sendBtn = document.getElementById('chat-send');
        if (sendBtn) {
            sendBtn.addEventListener('click', sendChatMessage);
        }

        var chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendChatMessage();
                }
            });
        }

        // Render initial chat
        renderChat();

        // Show home tab
        showTab('home');
    });
})();
