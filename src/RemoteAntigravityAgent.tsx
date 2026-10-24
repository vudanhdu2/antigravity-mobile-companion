import React, { useState, useEffect, useRef, useCallback } from 'react';
import { maskEmailsInText } from '../../utils/quotaDisplay';
import {
    Settings,
    RefreshCw,
    MessageSquareWarning,
    ChevronDown,
    ChevronUp,
    ChevronRight,
    Folder,
    FolderPlus,
    ListFilter,
    Plus,
    Mic,
    ArrowRight,
    ArrowLeft,
    Pin,
    Square,
    Copy,
    Check,
    Terminal,
    FileCode,
    Sparkles,
    Search,
    X,
    CheckCircle2,
    Loader2,
    PanelLeft,
    History,
    Clock,
    Archive,
    ShieldCheck,
    Laptop,
    Paperclip,
    FileText,
    Film,
    Music
} from 'lucide-react';

export interface RemoteAntigravityAgentProps {
    member: {
        id: string;
        username: string;
        display_name?: string;
        token: string;
        role?: string;
        contact?: string;
        permissions?: any;
    };
    permittedAccounts: any[];
    originUrl: string;
    onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
    onBackToPortal?: () => void;
}

export interface CompanionModel {
    id: string;
    label: string;
    name: string;
    tier: string;
    tag?: string;
    cliModel: string;
    proxyModel: string;
    remainingFraction?: number;
}

export interface CompanionConversationItem {
    id: string;
    title: string;
    workspaceTag?: string;
    projectId: string;
    projectName: string;
    stepCount: number;
    lastModifiedEpoch: number;
    relativeTime: string;
    status: string;
    isRunning: boolean;
    unread: boolean;
    pinned: boolean;
}

export interface CompanionProjectGroup {
    id: string;
    name: string;
    folderPath?: string;
    totalCount: number;
    conversations: CompanionConversationItem[];
}

export interface ToolCallItem {
    stepIdx?: number;
    name: string;
    command?: string;
    path?: string;
    summary?: string;
    status?: 'running' | 'success' | 'failed';
    output?: string;
}

export interface MediaAttachment {
    id?: string;
    name: string;
    mimeType: string;
    dataUrl?: string;
    url?: string;
    uri?: string;
    size?: number;
}

export interface TrajectoryMessage {
    id: string;
    idx?: number;
    role: 'user' | 'assistant' | 'system';
    content: string;
    thinking?: string;
    thinkingSeconds?: number;
    toolCalls?: ToolCallItem[];
    completed?: boolean;
    timestamp: number;
    images?: string[];
    media?: MediaAttachment[];
}

export interface ConversationDetail {
    id: string;
    title: string;
    projectId: string;
    projectName: string;
    status: string;
    isRunning: boolean;
    pinned: boolean;
    stepCount: number;
    lastModifiedTime?: string;
    messages: TrajectoryMessage[];
}

const DEFAULT_MODELS: CompanionModel[] = [
    {
        id: 'MODEL_PLACEHOLDER_M417',
        label: 'Gemini 4 Argon (High)',
        name: 'Gemini 4 Argon',
        tier: 'High',
        tag: 'New',
        cliModel: 'pro',
        proxyModel: 'gemini-2.5-flash',
        remainingFraction: 0.99
    },
    {
        id: 'MODEL_PLACEHOLDER_M418',
        label: 'Gemini 4 Argon (Medium)',
        name: 'Gemini 4 Argon',
        tier: 'Medium',
        tag: 'New',
        cliModel: 'pro',
        proxyModel: 'gemini-2.5-flash',
        remainingFraction: 0.99
    },
    {
        id: 'MODEL_PLACEHOLDER_M419',
        label: 'Gemini 4 Argon (Low)',
        name: 'Gemini 4 Argon',
        tier: 'Low',
        tag: 'New',
        cliModel: 'flash',
        proxyModel: 'gemini-2.5-flash',
        remainingFraction: 0.99
    },
    {
        id: 'MODEL_PLACEHOLDER_M318',
        label: 'Gemini 3.8 Flash (High)',
        name: 'Gemini 3.8 Flash',
        tier: 'High',
        tag: 'Fast',
        cliModel: 'flash',
        proxyModel: 'gemini-2.5-flash',
        remainingFraction: 0.99
    },
    {
        id: 'MODEL_PLACEHOLDER_M319',
        label: 'Gemini 3.8 Flash (Medium)',
        name: 'Gemini 3.8 Flash',
        tier: 'Medium',
        tag: 'Fast',
        cliModel: 'flash',
        proxyModel: 'gemini-2.5-flash',
        remainingFraction: 0.99
    },
    {
        id: 'MODEL_PLACEHOLDER_M320',
        label: 'Gemini 3.8 Flash (Low)',
        name: 'Gemini 3.8 Flash',
        tier: 'Low',
        tag: 'Fast',
        cliModel: 'flash_lite',
        proxyModel: 'gemini-2.5-flash',
        remainingFraction: 0.99
    },
    {
        id: 'MODEL_PLACEHOLDER_M26',
        label: 'Claude Opus 4.6 (Thinking)',
        name: 'Claude Opus 4.6',
        tier: 'Thinking',
        tag: 'Opus',
        cliModel: 'pro',
        proxyModel: 'gemini-2.5-flash',
        remainingFraction: 0.54
    },
    {
        id: 'MODEL_PLACEHOLDER_M35',
        label: 'Claude Sonnet 4.6 (Thinking)',
        name: 'Claude Sonnet 4.6',
        tier: 'Thinking',
        tag: 'Sonnet',
        cliModel: 'pro',
        proxyModel: 'gemini-2.5-flash',
        remainingFraction: 0.54
    },
    {
        id: 'MODEL_OPENAI_GPT_OSS_120B_MEDIUM',
        label: 'GPT-OSS 120B (Medium)',
        name: 'GPT-OSS 120B',
        tier: 'Medium',
        tag: '',
        cliModel: 'pro',
        proxyModel: 'gemini-2.5-flash',
        remainingFraction: 0.54
    }
];

const SLASH_COMMANDS = [
    { cmd: '/plan', desc: 'Lập kế hoạch từng bước chi tiết trước khi thực thi' },
    { cmd: '/boost', desc: 'Tư duy sâu đa chiều và kiểm chứng nghiêm ngặt' },
    { cmd: '/goal', desc: 'Chạy tự động liên tục cho đến khi hoàn thành mục tiêu' },
    { cmd: '/compact', desc: 'Tóm tắt ngữ cảnh phiên để giải phóng bộ nhớ' },
    { cmd: '/browser', desc: 'Tự động mở trình duyệt kiểm tra giao diện web' },
    { cmd: '/grill-me', desc: 'Phỏng vấn làm rõ các quyết định thiết kế hệ thống' },
    { cmd: '/learn', desc: 'Ghi nhớ quy tắc hoặc bài học mới vào hệ thống' }
];

const EXEC_MODES = [
    { id: 'Turbo', label: 'Turbo', desc: 'Auto-run safe commands & fast execution' },
    { id: 'Auto', label: 'Auto', desc: 'Standard autonomous agent execution' },
    { id: 'Ask', label: 'Ask', desc: 'Ask confirmation before running commands' }
];

const ENV_MODES = [
    { id: 'Local', label: 'Local', desc: 'Run directly in local workspace on host' },
    { id: 'Worktree', label: 'Worktree', desc: 'Isolated git worktree branch' }
];

// Google Antigravity 4-color ribbon 'A' logo SVG (for Mobile dark bar & Modals)
const AntigravityRibbonLogo: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
    <svg viewBox="0 0 36 36" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="ag_logo_grad" x1="4" y1="30" x2="32" y2="6" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#4285F4" />
                <stop offset="35%" stopColor="#EA4335" />
                <stop offset="70%" stopColor="#FBBC05" />
                <stop offset="100%" stopColor="#34A853" />
            </linearGradient>
        </defs>
        <path
            d="M7 29.5C9.5 21 13.8 7.5 18 7.5C22.2 7.5 26.5 21 29 29.5"
            stroke="url(#ag_logo_grad)"
            strokeWidth="4.2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M11.5 22.5C14.5 19.5 21.5 19.5 24.5 22.5"
            stroke="#4285F4"
            strokeWidth="3.6"
            strokeLinecap="round"
        />
    </svg>
);

// Monochrome black Antigravity 'A' ribbon logo SVG (matching PC App top-left icon in media_1792632335107_3b0e7514.png)
const AntigravityMonoLogo: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg viewBox="0 0 36 36" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
        <path
            d="M7 29.5C9.5 21 13.8 7.5 18 7.5C22.2 7.5 26.5 21 29 29.5"
            stroke="#1f1f1f"
            strokeWidth="4.4"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M11.5 23C14.5 19.5 21.5 19.5 24.5 23"
            stroke="#1f1f1f"
            strokeWidth="3.8"
            strokeLinecap="round"
        />
    </svg>
);

// Clean partial-arc circular spinner matching the PC App's running indicator (C)
const PcRunningArcSpinner: React.FC<{ className?: string }> = ({ className = 'w-[14px] h-[14px]' }) => (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.2" />
        <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
        />
    </svg>
);

export const RemoteAntigravityAgent: React.FC<RemoteAntigravityAgentProps> = ({
    member,
    originUrl,
    onToast,
    onBackToPortal
}) => {
    // Strictly distinguish Host System Owner (Admin) vs regular Member accounts
    const isSystemOwner =
        member.role === 'admin' ||
        member.id === 'system_owner' ||
        ['local_admin', 'admin'].includes((member.username || '').toLowerCase());
    const effectiveMemberId = isSystemOwner ? 'system_owner' : member.id;
    const safeMemberFolder = encodeURIComponent(member.id);
    const defaultHostName = isSystemOwner
        ? 'local-antigravity-pc'
        : `${(member.username || 'member').toLowerCase()}-pc`;
    const defaultHostLabel = isSystemOwner
        ? 'Antigravity (app chính)'
        : `Antigravity · Máy PC của ${member.display_name || member.username} (@${member.username})`;
    const defaultProjectId = isSystemOwner
        ? 'e3009192-6136-4652-a8f6-1f1238312ad6'
        : `ag-pc-${(member.username || 'member').toLowerCase()}`;
    const defaultProjectName = isSystemOwner
        ? 'AG'
        : `Antigravity PC (${member.display_name || member.username})`;

    // Companion HTTP URLs (works directly on HTTPS https://ag.aihot.vn via /api/ag-companion/* AND HTTP LAN :8046)
    const getCompanionBaseUrls = useCallback((): string[] => {
        const urls: string[] = [];
        if (typeof window !== 'undefined') {
            if (window.location.protocol === 'https:') {
                urls.push(originUrl);
            } else {
                const host = window.location.hostname;
                urls.push(`http://${host}:8046`);
                if (host !== '127.0.0.1' && host !== 'localhost') {
                    urls.push('http://127.0.0.1:8046');
                }
                urls.push(originUrl);
            }
        }
        return urls;
    }, [originUrl]);

    // Companion WebSocket URLs (works directly on wss://ag.aihot.vn/api/ag-companion/ws AND ws://<host>:8046/ws)
    const getCompanionWsUrls = useCallback((): string[] => {
        const urls: string[] = [];
        if (typeof window !== 'undefined' && member.token) {
            const q = `?memberId=${encodeURIComponent(effectiveMemberId)}&key=${encodeURIComponent(member.token)}`;
            if (window.location.protocol === 'https:') {
                urls.push(`wss://${window.location.host}/api/ag-companion/ws${q}`);
            } else {
                const host = window.location.hostname;
                urls.push(`ws://${host}:8046/ws${q}`);
                if (host !== '127.0.0.1' && host !== 'localhost') {
                    urls.push(`ws://127.0.0.1:8046/ws${q}`);
                }
            }
        }
        return urls;
    }, [effectiveMemberId, member.token]);

    // Overview State (Host, Models, Pinned Conversations, Projects)
    const [hostName, setHostName] = useState<string>(defaultHostName);
    const [hostInstances, setHostInstances] = useState<Array<{ id: string; name: string; label: string; online: boolean }>>([
        { id: isSystemOwner ? 'chinh' : 'member-pc', name: defaultHostName, label: defaultHostLabel, online: true }
    ]);
    const [selectedHostId, setSelectedHostId] = useState<string>(isSystemOwner ? 'chinh' : 'member-pc');
    const [models, setModels] = useState<CompanionModel[]>(DEFAULT_MODELS);
    const [selectedModel, setSelectedModel] = useState<CompanionModel>(DEFAULT_MODELS[0]);
    const [pinnedConversations, setPinnedConversations] = useState<CompanionConversationItem[]>([]);
    const [projects, setProjects] = useState<CompanionProjectGroup[]>([]);
    const [isLoadingOverview, setIsLoadingOverview] = useState<boolean>(true);
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
    const [wsLiveConnected, setWsLiveConnected] = useState<boolean>(false);

    // Desktop Sidebar & Composer Controls
    const [desktopSidebarOpen, setDesktopSidebarOpen] = useState<boolean>(true);
    const [execMode, setExecMode] = useState<string>('Turbo');
    const [envMode, setEnvMode] = useState<string>('Local');
    const [execMenuOpen, setExecMenuOpen] = useState<boolean>(false);
    const [envMenuOpen, setEnvMenuOpen] = useState<boolean>(false);
    const [desktopProjectMenuOpen, setDesktopProjectMenuOpen] = useState<boolean>(false);
    const [historyModalOpen, setHistoryModalOpen] = useState<boolean>(false);
    const [automationsModalOpen, setAutomationsModalOpen] = useState<boolean>(false);
    const [customizationsModalOpen, setCustomizationsModalOpen] = useState<boolean>(false);

    // Collapsible sections & expansion state
    const [pinnedSectionOpen, setPinnedSectionOpen] = useState<boolean>(true);
    const [projectsSectionOpen, setProjectsSectionOpen] = useState<boolean>(true);
    const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
    const [expandedSeeAllProjects, setExpandedSeeAllProjects] = useState<Record<string, boolean>>({});
    const [filterUnreadOnly, setFilterUnreadOnly] = useState<boolean>(false);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [searchBarOpen, setSearchBarOpen] = useState<boolean>(false);

    // Active Conversation View State & Back/Forward History Stack
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [activeConversation, setActiveConversation] = useState<ConversationDetail | null>(null);
    const [isLoadingConversation, setIsLoadingConversation] = useState<boolean>(false);
    const [targetNewProjectId, setTargetNewProjectId] = useState<string>(defaultProjectId);
    const [targetNewProjectName, setTargetNewProjectName] = useState<string>(defaultProjectName);
    const [navHistory, setNavHistory] = useState<Array<string | null>>([null]);
    const [navIndex, setNavIndex] = useState<number>(0);

    // Composer State
    const [promptText, setPromptText] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
    const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
    const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
    const [attachedMedia, setAttachedMedia] = useState<MediaAttachment[]>([]);
    const [isDraggingMedia, setIsDraggingMedia] = useState<boolean>(false);
    const [isListeningVoice, setIsListeningVoice] = useState<boolean>(false);

    // Modals / Popovers
    const [hostMenuOpen, setHostMenuOpen] = useState<boolean>(false);
    const [modelMenuOpen, setModelMenuOpen] = useState<boolean>(false);
    const [settingsModalOpen, setSettingsModalOpen] = useState<boolean>(false);
    const [slashMenuOpen, setSlashMenuOpen] = useState<boolean>(false);
    const [mentionMenuOpen, setMentionMenuOpen] = useState<boolean>(false);
    const [newProjectModalOpen, setNewProjectModalOpen] = useState<boolean>(false);

    const desktopTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const mobileTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const desktopMessagesEndRef = useRef<HTMLDivElement | null>(null);
    const mobileMessagesEndRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const companionWsRef = useRef<WebSocket | null>(null);
    const activeCidRef = useRef<string | null>(null);
    activeCidRef.current = activeConversationId;
    const pendingUserMsgsRef = useRef<Record<string, { text: string; media?: MediaAttachment[]; sentAt: number; title?: string; projectId?: string; projectName?: string }>>({});

    // Merge optimistic sent user message into conversation detail so background polls never wipe out just-sent prompts
    const mergePendingUserMsg = useCallback((detail: ConversationDetail): ConversationDetail => {
        if (!detail || !detail.id) return detail;
        const pending = pendingUserMsgsRef.current[detail.id];
        if (!pending) return detail;
        if (Date.now() - pending.sentAt > 50000) {
            delete pendingUserMsgsRef.current[detail.id];
            return detail;
        }
        const msgs = Array.isArray(detail.messages) ? [...detail.messages] : [];
        const hasMsg = msgs.slice(-6).some(
            m =>
                m.role === 'user' &&
                ((pending.text.trim() && (m.content || '').trim() === pending.text.trim()) ||
                    (!pending.text.trim() && pending.media?.length && m.media?.length))
        );
        if (!hasMsg) {
            msgs.push({
                id: `opt_u_${pending.sentAt}`,
                role: 'user',
                content: pending.text,
                media: pending.media,
                timestamp: pending.sentAt
            });
            return {
                ...detail,
                title: detail.title && detail.title !== 'Conversation' ? detail.title : (pending.title || detail.title),
                projectId: detail.projectId || pending.projectId || defaultProjectId,
                projectName: detail.projectName || pending.projectName || defaultProjectName,
                isRunning: true,
                status: 'CASCADE_RUN_STATUS_RUNNING',
                stepCount: Math.max(detail.stepCount || 0, msgs.length),
                messages: msgs
            };
        }
        if (Date.now() - pending.sentAt < 8000 && msgs[msgs.length - 1]?.role === 'user') {
            return {
                ...detail,
                isRunning: true,
                status: 'CASCADE_RUN_STATUS_RUNNING'
            };
        }
        return detail;
    }, [defaultProjectId, defaultProjectName]);

    // Universal Companion Command Dispatcher (works on HTTP LAN :8046 AND HTTPS https://ag.aihot.vn via same-origin relay)
    const dispatchCompanionCommand = useCallback(
        async (action: 'new' | 'send' | 'pin' | 'cancel' | 'save_conv', payload: Record<string, any>): Promise<any> => {
            const authToken = member.token;
            const scopedPayload = { ...payload, memberId: effectiveMemberId };
            const candidates = getCompanionBaseUrls();
            for (const base of candidates) {
                try {
                    const res = await fetch(`${base}/api/ag-companion/${action}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${authToken}`
                        },
                        body: JSON.stringify(scopedPayload),
                        signal: AbortSignal.timeout(25000)
                    });
                    if (res.ok) {
                        const resJson = await res.json();
                        if (resJson && resJson.memberUseCloudStream) {
                            return resJson;
                        }
                        if (resJson && resJson.ok !== false) {
                            return resJson;
                        }
                    }
                } catch {
                    // Fallback to next candidate or same-origin HTTPS relay
                }
            }

            // Same-origin HTTPS relay via /api/member/sync-ide-usage -> /ag-remote/cmd/<cmdId>.json
            const cmdId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const cmdObj = { cmdId, action, ...scopedPayload };
            const rawStr = JSON.stringify(cmdObj);
            const b64 = btoa(unescape(encodeURIComponent(rawStr)));
            // Always use the authenticated member's own token

            const enqueueRes = await fetch(`${originUrl}/api/member/sync-ide-usage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    items: [],
                    prompts: [
                        {
                            conv_id: `__AG_CMD__:${b64}`,
                            step_idx: Math.floor(Date.now() % 1000000000),
                            timestamp: 1
                        }
                    ]
                }),
                signal: AbortSignal.timeout(6000)
            });

            if (!enqueueRes.ok) {
                throw new Error(`Queue HTTP ${enqueueRes.status}`);
            }

            const deadline = Date.now() + 12000;
            while (Date.now() < deadline) {
                await new Promise(r => setTimeout(r, 170));
                try {
                    const pollRes = await fetch(`${originUrl}/ag-remote/cmd/${cmdId}.json?t=${Date.now()}`, {
                        headers: { Authorization: `Bearer ${authToken}` },
                        signal: AbortSignal.timeout(2000)
                    });
                    const ctype = (pollRes.headers.get('content-type') || '').toLowerCase();
                    if (pollRes.ok && ctype.includes('json')) {
                        const data = await pollRes.json();
                        if (data && data.cmdId === cmdId) {
                            return data;
                        }
                    }
                } catch {
                    // Keep polling until receipt file is written
                }
            }
            throw new Error('Timeout waiting for companion bridge receipt');
        },
        [getCompanionBaseUrls, isSystemOwner, effectiveMemberId, member.token, originUrl]
    );

    // Apply overview payload to state
    const applyOverviewData = useCallback((data: any) => {
        if (!data) return;
        // Guard against applying Host Owner overview to a non-owner member session
        if (!isSystemOwner && data?.host?.name === 'local-antigravity-pc' && !data?.memberIsolated) {
            return;
        }
        if (data?.host?.name) setHostName(data.host.name);
        if (Array.isArray(data?.host?.instances) && data.host.instances.length > 0) {
            setHostInstances(data.host.instances);
        }
        if (Array.isArray(data?.models) && data.models.length > 0) {
            setModels(data.models);
            setSelectedModel(prev => data.models.find((m: CompanionModel) => m.id === prev.id) || data.models[0]);
        }
        if (Array.isArray(data?.pinnedConversations)) {
            setPinnedConversations(data.pinnedConversations);
        }
        if (Array.isArray(data?.projects)) {
            setProjects(data.projects);
        }
        setIsLoadingOverview(false);
        setIsRefreshing(false);
    }, [isSystemOwner]);

    // Fetch overview from Companion Bridge (port 8046) or static snapshot fallback (strictly scoped by member)
    const fetchOverview = useCallback(async (silent = false) => {
        if (!silent) setIsRefreshing(true);
        const candidates = getCompanionBaseUrls();
        let loaded = false;

        for (const base of candidates) {
            try {
                const res = await fetch(
                    `${base}/api/ag-companion/overview?memberId=${encodeURIComponent(effectiveMemberId)}`,
                    {
                        headers: { Authorization: `Bearer ${member.token}` },
                        signal: AbortSignal.timeout(2000)
                    }
                );
                if (res.ok) {
                    const data = await res.json();
                    applyOverviewData(data);
                    loaded = true;
                    break;
                }
            } catch {
                // Try next candidate
            }
        }

        if (!loaded) {
            const snapshotUrl = isSystemOwner
                ? `${originUrl}/ag-remote/overview.json?t=${Date.now()}`
                : `${originUrl}/ag-remote/members/${safeMemberFolder}/overview.json?t=${Date.now()}`;
            try {
                const res = await fetch(snapshotUrl, {
                    headers: { Authorization: `Bearer ${member.token}` },
                    signal: AbortSignal.timeout(3000)
                });
                const ctype = (res.headers.get('content-type') || '').toLowerCase();
                if (res.ok && ctype.includes('json')) {
                    const data = await res.json();
                    applyOverviewData(data);
                    loaded = true;
                }
            } catch {
                // Ignore static fallback error
            }
        }

        if (!loaded && !isSystemOwner) {
            // Ensure non-owner member at least sees their own empty PC project if no snapshot exists yet
            setProjects(prev =>
                prev.length > 0
                    ? prev
                    : [
                          {
                              id: defaultProjectId,
                              name: defaultProjectName,
                              folderPath: defaultHostLabel,
                              totalCount: 0,
                              conversations: []
                          }
                      ]
            );
        }

        setIsLoadingOverview(false);
        setIsRefreshing(false);
    }, [
        getCompanionBaseUrls,
        effectiveMemberId,
        isSystemOwner,
        safeMemberFolder,
        originUrl,
        applyOverviewData,
        defaultProjectId,
        defaultProjectName,
        defaultHostLabel
    ]);

    // Fetch single conversation detail (parallel instant snapshot + live companion API, strictly scoped by member)
    const fetchConversationDetail = useCallback(async (cid: string, silent = false) => {
        if (!cid || cid.startsWith('pending_')) {
            if (!silent) setIsLoadingConversation(false);
            return;
        }
        if (cid.startsWith('local_') && isSystemOwner) {
            try {
                const raw = localStorage.getItem(`ag_local_conv_${member.id}_${cid}`) || localStorage.getItem(`ag_local_conv_${cid}`);
                if (raw && activeCidRef.current === cid) {
                    setActiveConversation(mergePendingUserMsg(JSON.parse(raw)));
                }
            } catch {}
            if (!silent) setIsLoadingConversation(false);
            return;
        }
        if (!silent) setIsLoadingConversation(true);
        const candidates = getCompanionBaseUrls();
        let loaded = false;
        const safeCid = cid.replace(/[^a-zA-Z0-9_.:-]/g, '_');

        // 1. Instant same-origin snapshot load (<15ms) if available
        const snapshotPromise = (async () => {
            const snapUrl = isSystemOwner
                ? `${originUrl}/ag-remote/conv/${safeCid}.json?t=${Date.now()}`
                : `${originUrl}/ag-remote/members/${safeMemberFolder}/conv/${safeCid}.json?t=${Date.now()}`;
            try {
                const res = await fetch(snapUrl, {
                    headers: { Authorization: `Bearer ${member.token}` },
                    signal: AbortSignal.timeout(2500)
                });
                const ctype = (res.headers.get('content-type') || '').toLowerCase();
                if (res.ok && ctype.includes('json')) {
                    const rawDetail: ConversationDetail = await res.json();
                    const detail = mergePendingUserMsg(rawDetail);
                    if (activeCidRef.current === cid) {
                        setActiveConversation(prev => {
                            if (
                                prev &&
                                prev.id === cid &&
                                detail.messages?.length === 1 &&
                                String(detail.messages[0]?.id || '').startsWith('empty_') &&
                                prev.messages.length > 0 &&
                                !String(prev.messages[0]?.id || '').startsWith('empty_')
                            ) {
                                return prev;
                            }
                            return prev && prev.id === cid && (prev.messages?.length || 0) > (detail.messages?.length || 0)
                                ? prev
                                : detail;
                        });
                        setIsLoadingConversation(false);
                    }
                    loaded = true;
                }
            } catch {}
        })();

        // 2. Live Companion Bridge API (marks read & fetches latest live step)
        const livePromise = (async () => {
            for (const base of candidates) {
                try {
                    const res = await fetch(
                        `${base}/api/ag-companion/conversation/${encodeURIComponent(cid)}?markRead=1&limit=180&memberId=${encodeURIComponent(effectiveMemberId)}`,
                        {
                            headers: { Authorization: `Bearer ${member.token}` },
                            signal: AbortSignal.timeout(3000)
                        }
                    );
                    if (res.ok) {
                        const rawDetail: ConversationDetail = await res.json();
                        const detail = mergePendingUserMsg(rawDetail);
                        if (activeCidRef.current === cid) {
                            setActiveConversation(prev => {
                                if (
                                    prev &&
                                    prev.id === cid &&
                                    detail.messages?.length === 1 &&
                                    String(detail.messages[0]?.id || '').startsWith('empty_') &&
                                    prev.messages.length > 0 &&
                                    !String(prev.messages[0]?.id || '').startsWith('empty_')
                                ) {
                                    return prev;
                                }
                                return detail;
                            });
                            setIsLoadingConversation(false);
                        }
                        loaded = true;
                        break;
                    }
                } catch {
                    // Try next
                }
            }
        })();

        await Promise.allSettled([snapshotPromise, livePromise]);

        if (!loaded) {
            try {
                const raw = localStorage.getItem(`ag_local_conv_${member.id}_${cid}`);
                if (raw && activeCidRef.current === cid) {
                    setActiveConversation(mergePendingUserMsg(JSON.parse(raw)));
                }
            } catch {}
        }

        if (!silent && activeCidRef.current === cid) setIsLoadingConversation(false);
    }, [getCompanionBaseUrls, isSystemOwner, safeMemberFolder, effectiveMemberId, member.id, originUrl, mergePendingUserMsg]);

    // =========================================================================
    // REAL-TIME WEBSOCKET ENGINE (Direct Companion WS :8046/ws + Portal WS :8045)
    // =========================================================================
    useEffect(() => {
        let unmounted = false;
        let companionWs: WebSocket | null = null;
        let portalWs: WebSocket | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let portalReconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let pingInterval: ReturnType<typeof setInterval> | null = null;

        // 1. Direct Companion WebSocket (ws://<host>:8046/ws or ws://127.0.0.1:8046/ws)
        const wsCandidates = getCompanionWsUrls();
        let wsIdx = 0;

        const connectCompanionWs = () => {
            if (unmounted || wsCandidates.length === 0) return;
            const targetUrl = wsCandidates[wsIdx % wsCandidates.length];
            try {
                const ws = new WebSocket(targetUrl);
                companionWs = ws;
                companionWsRef.current = ws;

                ws.onopen = () => {
                    if (unmounted) return;
                    setWsLiveConnected(true);
                    if (activeCidRef.current && !activeCidRef.current.startsWith('pending_') && !activeCidRef.current.startsWith('local_')) {
                        try {
                            ws.send(JSON.stringify({ type: 'subscribe', conversationId: activeCidRef.current }));
                        } catch {}
                    }
                    if (pingInterval) clearInterval(pingInterval);
                    pingInterval = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            try {
                                ws.send(JSON.stringify({ type: 'ping' }));
                            } catch {}
                        }
                    }, 15000);
                };

                ws.onmessage = event => {
                    if (unmounted || typeof event.data !== 'string') return;
                    try {
                        const msg = JSON.parse(event.data);
                        if (msg.type === 'overview' && msg.data) {
                            applyOverviewData(msg.data);
                        } else if (
                            msg.type === 'conversation' &&
                            msg.data &&
                            msg.conversationId === activeCidRef.current
                        ) {
                            setActiveConversation(mergePendingUserMsg(msg.data));
                            setIsLoadingConversation(false);
                        }
                    } catch {}
                };

                ws.onerror = () => {
                    wsIdx += 1;
                };

                ws.onclose = () => {
                    if (unmounted) return;
                    companionWsRef.current = null;
                    if (pingInterval) {
                        clearInterval(pingInterval);
                        pingInterval = null;
                    }
                    if (reconnectTimer) clearTimeout(reconnectTimer);
                    reconnectTimer = setTimeout(connectCompanionWs, 2500);
                };
            } catch {
                wsIdx += 1;
                if (reconnectTimer) clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(connectCompanionWs, 3000);
            }
        };

        // 2. Main Portal WebSocket (wss://ag.aihot.vn/api/member/ws or ws://127.0.0.1:8045/api/member/ws)
        const connectPortalWs = () => {
            if (unmounted || typeof window === 'undefined' || !member.token) return;
            try {
                const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const pUrl = `${proto}//${window.location.host}/api/member/ws?key=${encodeURIComponent(member.token)}`;
                const pws = new WebSocket(pUrl);
                portalWs = pws;

                pws.onopen = () => {
                    if (unmounted) return;
                    setWsLiveConnected(true);
                };

                pws.onmessage = event => {
                    if (unmounted || typeof event.data !== 'string') return;
                    try {
                        const ev = JSON.parse(event.data);
                        if (
                            ev?.type === 'usage_updated' ||
                            ev?.type === 'request_ide_sync' ||
                            ev?.type === 'ag_companion_sync'
                        ) {
                            // If direct companion WS is not open, immediately sync fresh snapshots
                            if (!companionWsRef.current || companionWsRef.current.readyState !== WebSocket.OPEN) {
                                fetchOverview(true);
                                if (activeCidRef.current) {
                                    fetchConversationDetail(activeCidRef.current, true);
                                }
                            }
                        }
                    } catch {}
                };

                pws.onclose = () => {
                    if (unmounted) return;
                    if (portalReconnectTimer) clearTimeout(portalReconnectTimer);
                    portalReconnectTimer = setTimeout(connectPortalWs, 3000);
                };
            } catch {}
        };

        fetchOverview(false);
        connectCompanionWs();
        connectPortalWs();

        // Fast real-time fallback heartbeat (1.8s) so static /ag-remote/ snapshots also stream smoothly
        const fastTimer = setInterval(() => {
            if (!companionWsRef.current || companionWsRef.current.readyState !== WebSocket.OPEN) {
                fetchOverview(true);
                if (activeCidRef.current) {
                    fetchConversationDetail(activeCidRef.current, true);
                }
            }
        }, 1800);

        return () => {
            unmounted = true;
            clearInterval(fastTimer);
            if (pingInterval) clearInterval(pingInterval);
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (portalReconnectTimer) clearTimeout(portalReconnectTimer);
            try {
                companionWs?.close();
            } catch {}
            try {
                portalWs?.close();
            } catch {}
        };
    }, [getCompanionWsUrls, member.token, fetchOverview, fetchConversationDetail, applyOverviewData]);

    // Subscribe to activeConversationId over WebSocket whenever user switches conversation
    useEffect(() => {
        if (companionWsRef.current && companionWsRef.current.readyState === WebSocket.OPEN) {
            try {
                companionWsRef.current.send(
                    JSON.stringify({ type: 'subscribe', conversationId: activeConversationId })
                );
            } catch {}
        }
        if (activeConversationId) {
            fetchConversationDetail(activeConversationId, false);
        }
    }, [activeConversationId, fetchConversationDetail]);

    // Auto-scroll to bottom when opening a conversation or receiving new step/output
    const prevMsgSignatureRef = useRef<string>('');
    useEffect(() => {
        const msgs = activeConversation?.messages || [];
        const last = msgs[msgs.length - 1];
        const sig = `${activeConversation?.id || ''}:${msgs.length}:${last?.id || ''}:${last?.content?.length || 0}:${last?.toolCalls?.length || 0}`;
        if (sig !== prevMsgSignatureRef.current) {
            prevMsgSignatureRef.current = sig;
            setTimeout(() => {
                desktopMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                mobileMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 60);
        }
    }, [activeConversation]);

    // Navigate to a conversation (and push to Back/Forward history stack)
    const navigateToConversation = (cid: string | null, pushHistory = true) => {
        prevMsgSignatureRef.current = '';
        setActiveConversationId(cid);
        if (!cid) {
            setActiveConversation(null);
        }
        if (pushHistory) {
            setNavHistory(prev => {
                const sliced = prev.slice(0, navIndex + 1);
                if (sliced[sliced.length - 1] === cid) return sliced;
                const next = [...sliced, cid];
                setNavIndex(next.length - 1);
                return next;
            });
        }
    };

    const handleNavBack = () => {
        if (navIndex > 0) {
            const nextIdx = navIndex - 1;
            setNavIndex(nextIdx);
            navigateToConversation(navHistory[nextIdx], false);
        }
    };

    const handleNavForward = () => {
        if (navIndex < navHistory.length - 1) {
            const nextIdx = navIndex + 1;
            setNavIndex(nextIdx);
            navigateToConversation(navHistory[nextIdx], false);
        }
    };

    // Handle opening a conversation from Pinned or Projects list
    const handleOpenConversation = (conv: CompanionConversationItem) => {
        setTargetNewProjectId(conv.projectId);
        setTargetNewProjectName(conv.projectName);
        setHistoryModalOpen(false);
        navigateToConversation(conv.id, true);
        // Optimistically clear unread dot in UI
        setProjects(prev =>
            prev.map(p => ({
                ...p,
                conversations: p.conversations.map(c => (c.id === conv.id ? { ...c, unread: false } : c))
            }))
        );
    };

    // Handle clicking '+ New Conversation' or '+' next to a Project folder
    const handleStartNewInProject = (proj?: CompanionProjectGroup, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (proj) {
            setTargetNewProjectId(proj.id);
            setTargetNewProjectName(proj.name);
        }
        navigateToConversation(null, true);
        setTimeout(() => {
            desktopTextareaRef.current?.focus();
            mobileTextareaRef.current?.focus();
        }, 80);
    };

    // Toggle Pin conversation
    const handleTogglePin = async (cid: string, currentPinned: boolean) => {
        const nextPinned = !currentPinned;
        try {
            const res = await dispatchCompanionCommand('pin', { conversationId: cid, pinned: nextPinned });
            if (res && res.ok !== false) {
                if (activeConversation && activeConversation.id === cid) {
                    setActiveConversation({ ...activeConversation, pinned: nextPinned });
                }
                fetchOverview(true);
                onToast(nextPinned ? 'Đã ghim vào Pinned Conversations' : 'Đã bỏ ghim hội thoại', 'success');
            }
        } catch {
            onToast('Không thể cập nhật trạng thái ghim', 'error');
        }
    };

    // Handle prompt input changes (detect '/' slash commands and '@' mentions)
    const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setPromptText(val);

        e.target.style.height = 'auto';
        e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;

        if (val === '/' || (val.startsWith('/') && !val.includes(' '))) {
            setSlashMenuOpen(true);
            setMentionMenuOpen(false);
        } else if (val.endsWith('@') || /@\w*$/.test(val)) {
            setMentionMenuOpen(true);
            setSlashMenuOpen(false);
        } else {
            setSlashMenuOpen(false);
            setMentionMenuOpen(false);
        }
    };

    // Voice input via Web Speech API
    const handleVoiceInput = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            onToast('Trình duyệt trên thiết bị này chưa hỗ trợ nhận diện giọng nói trực tiếp', 'info');
            return;
        }
        if (isListeningVoice) {
            setIsListeningVoice(false);
            return;
        }
        try {
            const recognition = new SpeechRecognition();
            recognition.lang = 'vi-VN';
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;
            setIsListeningVoice(true);
            recognition.onresult = (event: any) => {
                const transcript = event.results?.[0]?.[0]?.transcript || '';
                if (transcript) {
                    setPromptText(prev => (prev ? `${prev} ${transcript}` : transcript));
                }
                setIsListeningVoice(false);
            };
            recognition.onerror = () => setIsListeningVoice(false);
            recognition.onend = () => setIsListeningVoice(false);
            recognition.start();
        } catch {
            setIsListeningVoice(false);
        }
    };

    const formatFileSize = (bytes?: number): string => {
        if (!bytes || bytes <= 0) return '';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const resolveMediaUrl = useCallback(
        (item: MediaAttachment): string => {
            if (item.dataUrl) return item.dataUrl;
            const rawUrl = item.url || '';
            if (!rawUrl) return '';
            if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) return rawUrl;
            const sep = rawUrl.includes('?') ? '&' : '?';
            const withKey = member.token ? `${rawUrl}${sep}key=${encodeURIComponent(member.token)}` : rawUrl;
            if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) return withKey;
            if (typeof window !== 'undefined' && window.location.protocol === 'http:') {
                return `http://${window.location.hostname}:8046${withKey}`;
            }
            return `${originUrl}${withKey}`;
        },
        [member.token, originUrl]
    );

    const handleFilesSelected = useCallback(
        (fileList: FileList | File[] | null) => {
            if (!fileList) return;
            const files = Array.from(fileList);
            if (files.length === 0) return;
            files.slice(0, 10).forEach(file => {
                if (file.size > 40 * 1024 * 1024) {
                    onToast(`File "${file.name}" vượt quá giới hạn 40MB`, 'error');
                    return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                    if (typeof reader.result === 'string') {
                        setAttachedMedia(prev => [
                            ...prev,
                            {
                                id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                                name: file.name || 'media',
                                mimeType: file.type || 'application/octet-stream',
                                dataUrl: reader.result as string,
                                size: file.size
                            }
                        ]);
                    }
                };
                reader.readAsDataURL(file);
            });
        },
        [onToast]
    );

    const handlePasteMedia = useCallback(
        (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            const files: File[] = [];
            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                if (it.kind === 'file') {
                    const f = it.getAsFile();
                    if (f) files.push(f);
                }
            }
            if (files.length > 0) {
                e.preventDefault();
                handleFilesSelected(files);
                onToast(`Đã đính kèm ${files.length} media từ bộ nhớ tạm`, 'info');
            }
        },
        [handleFilesSelected, onToast]
    );

    const handleDropMedia = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingMedia(false);
            if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                handleFilesSelected(e.dataTransfer.files);
            }
        },
        [handleFilesSelected]
    );

    // Fallback cloud streaming via /v1/chat/completions if local companion RPC is not reachable
    const streamViaCloudProxy = async (
        prompt: string,
        existingConv?: ConversationDetail | null,
        mediaList?: MediaAttachment[]
    ) => {
        const cid = existingConv?.id || `local_${Date.now()}`;
        const userMsg: TrajectoryMessage = {
            id: `u_${Date.now()}`,
            role: 'user',
            content: prompt,
            media: mediaList && mediaList.length > 0 ? mediaList : undefined,
            timestamp: Date.now()
        };
        const assistantMsgId = `a_${Date.now() + 1}`;
        const initialAssistantMsg: TrajectoryMessage = {
            id: assistantMsgId,
            role: 'assistant',
            content: '',
            thinking: '',
            thinkingSeconds: 0,
            completed: false,
            timestamp: Date.now()
        };

        const baseConv: ConversationDetail = existingConv
            ? {
                  ...existingConv,
                  isRunning: true,
                  messages: [...existingConv.messages, userMsg, initialAssistantMsg]
              }
            : {
                  id: cid,
                  title: prompt.slice(0, 65),
                  projectId: targetNewProjectId,
                  projectName: targetNewProjectName,
                  status: 'CASCADE_RUN_STATUS_RUNNING',
                  isRunning: true,
                  pinned: false,
                  stepCount: 2,
                  messages: [userMsg, initialAssistantMsg]
              };

        activeCidRef.current = cid;
        navigateToConversation(cid, true);
        setActiveConversation(baseConv);
        if (!isSystemOwner) {
            dispatchCompanionCommand('save_conv', { conversation: baseConv }).catch(() => {});
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;
        const startTime = Date.now();

        try {
            const historyMessages = baseConv.messages
                .slice(0, -1)
                .filter(m => !String(m.id || '').startsWith('empty_') && (m.role === 'user' || Boolean(m.content?.trim())))
                .map(m => {
                    const role = m.role === 'system' ? 'user' : m.role;
                    const imgs = (m.media || []).filter(att => (att.mimeType || '').startsWith('image/') && att.dataUrl);
                    if (role === 'user' && imgs.length > 0) {
                        return {
                            role: 'user',
                            content: [
                                { type: 'text', text: m.content || 'Phân tích hình ảnh đính kèm' },
                                ...imgs.map(img => ({
                                    type: 'image_url',
                                    image_url: { url: img.dataUrl }
                                }))
                            ]
                        };
                    }
                    return { role, content: m.content || 'Phân tích media đính kèm' };
                });

            const res = await fetch(`${originUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${member.token}`
                },
                body: JSON.stringify({
                    model: selectedModel.proxyModel || 'gemini-2.5-flash',
                    stream: true,
                    messages: [
                        {
                            role: 'system',
                            content: `You are Google Antigravity running on ${hostName} in project "${baseConv.projectName}". Respond in Vietnamese with clean Markdown.`
                        },
                        ...historyMessages
                    ]
                }),
                signal: controller.signal
            });

            if (!res.ok || !res.body) {
                throw new Error(`HTTP ${res.status}`);
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let accContent = '';
            let accThinking = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const rawLine of lines) {
                    const line = rawLine.trim();
                    if (!line.startsWith('data:')) continue;
                    const dataStr = line.slice(5).trim();
                    if (dataStr === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(dataStr);
                        const delta = parsed.choices?.[0]?.delta;
                        if (!delta) continue;
                        if (delta.reasoning_content) accThinking += delta.reasoning_content;
                        if (delta.content) accContent += delta.content;

                        const elapsedSecs = Math.max(1, Math.round((Date.now() - startTime) / 1000));
                        setActiveConversation(prev => {
                            const targetBase =
                                prev && prev.id === cid && prev.messages.some(m => m.id === assistantMsgId)
                                    ? prev
                                    : baseConv;
                            return {
                                ...targetBase,
                                messages: targetBase.messages.map(m =>
                                    m.id === assistantMsgId
                                        ? {
                                              ...m,
                                              content: accContent,
                                              thinking: accThinking,
                                              thinkingSeconds: accThinking ? elapsedSecs : 0
                                          }
                                        : m
                                )
                            };
                        });
                    } catch {}
                }
            }

            const elapsedSecsFinal = Math.max(1, Math.round((Date.now() - startTime) / 1000));
            setActiveConversation(prev => {
                const targetBase =
                    prev && prev.id === cid && prev.messages.some(m => m.id === assistantMsgId) ? prev : baseConv;
                const doneConv = {
                    ...targetBase,
                    isRunning: false,
                    status: 'CASCADE_RUN_STATUS_IDLE',
                    messages: targetBase.messages.map(m =>
                        m.id === assistantMsgId
                            ? {
                                  ...m,
                                  content: accContent || m.content,
                                  thinking: accThinking || m.thinking,
                                  thinkingSeconds: accThinking ? elapsedSecsFinal : m.thinkingSeconds,
                                  completed: true
                              }
                            : m
                    )
                };
                try {
                    localStorage.setItem(`ag_local_conv_${member.id}_${cid}`, JSON.stringify(doneConv));
                } catch {}
                if (!isSystemOwner) {
                    dispatchCompanionCommand('save_conv', { conversation: doneConv })
                        .then(() => fetchOverview(true))
                        .catch(() => {});
                }
                return doneConv;
            });
        } catch (err: any) {
            if (err?.name !== 'AbortError') {
                onToast(`Lỗi kết nối: ${err?.message || 'Không xác định'}`, 'error');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // Submit prompt (either into active real Antigravity conversation or creating a new real conversation in target project)
    const handleSubmitPrompt = async () => {
        const text = promptText.trim();
        const mediaToSend = [...attachedMedia];
        if ((!text && mediaToSend.length === 0) || isSubmitting) return;

        setPromptText('');
        setAttachedMedia([]);
        setSlashMenuOpen(false);
        setMentionMenuOpen(false);
        if (desktopTextareaRef.current) desktopTextareaRef.current.style.height = 'auto';
        if (mobileTextareaRef.current) mobileTextareaRef.current.style.height = 'auto';
        setIsSubmitting(true);

        const nowMs = Date.now();
        const autoTitle = text
            ? text.split('\n')[0].slice(0, 70)
            : `Đính kèm: ${mediaToSend.map(m => m.name).join(', ').slice(0, 55)}`;

        const payloadMedia = mediaToSend.map(m => ({
            name: m.name,
            mimeType: m.mimeType,
            dataUrl: m.dataUrl,
            size: m.size
        }));

        // Case 1: Inside an existing conversation -> send follow-up via SendUserCascadeMessage
        if (activeConversationId && !activeConversationId.startsWith('pending_')) {
            const targetCid = activeConversationId;
            pendingUserMsgsRef.current[targetCid] = {
                text,
                media: mediaToSend,
                sentAt: nowMs,
                title: activeConversation?.title || autoTitle,
                projectId: activeConversation?.projectId || targetNewProjectId,
                projectName: activeConversation?.projectName || targetNewProjectName
            };
            const optimisticUserMsg: TrajectoryMessage = {
                id: `opt_u_${nowMs}`,
                role: 'user',
                content: text,
                media: mediaToSend.length > 0 ? mediaToSend : undefined,
                timestamp: nowMs
            };
            setActiveConversation(prev =>
                prev
                    ? {
                          ...prev,
                          isRunning: true,
                          status: 'CASCADE_RUN_STATUS_RUNNING',
                          stepCount: (prev.stepCount || 0) + 1,
                          messages: [...prev.messages, optimisticUserMsg]
                      }
                    : prev
            );

            try {
                const res = await dispatchCompanionCommand('send', {
                    conversationId: targetCid,
                    text,
                    media: payloadMedia,
                    model: selectedModel.id,
                    app: selectedHostId
                });
                if (res && res.ok !== false && !res.memberUseCloudStream) {
                    setIsSubmitting(false);
                    fetchOverview(true);
                    setTimeout(() => fetchConversationDetail(targetCid, true), 400);
                    return;
                }
            } catch {}

            await streamViaCloudProxy(text, activeConversation, mediaToSend);
            return;
        }

        // Case 2: In New Conversation state -> immediately show optimistic conversation view & create real conversation in target project
        const pendingCid = `pending_${nowMs}`;
        const optimisticConv: ConversationDetail = {
            id: pendingCid,
            title: autoTitle,
            projectId: targetNewProjectId,
            projectName: targetNewProjectName,
            status: 'CASCADE_RUN_STATUS_RUNNING',
            isRunning: true,
            pinned: false,
            stepCount: 1,
            messages: [
                {
                    id: `opt_u_${nowMs}`,
                    role: 'user',
                    content: text,
                    media: mediaToSend.length > 0 ? mediaToSend : undefined,
                    timestamp: nowMs
                }
            ]
        };
        activeCidRef.current = pendingCid;
        setActiveConversation(optimisticConv);
        navigateToConversation(pendingCid, false);

        try {
            const data = await dispatchCompanionCommand('new', {
                projectId: targetNewProjectId,
                prompt: text,
                media: payloadMedia,
                model: selectedModel.id,
                title: autoTitle
            });
            if (data && data.conversationId && !data.memberUseCloudStream) {
                const newCid = String(data.conversationId);
                pendingUserMsgsRef.current[newCid] = {
                    text,
                    media: data.media || mediaToSend,
                    sentAt: nowMs,
                    title: data.title || autoTitle,
                    projectId: targetNewProjectId,
                    projectName: targetNewProjectName
                };
                const realConv: ConversationDetail = {
                    ...optimisticConv,
                    id: newCid,
                    title: data.title || autoTitle
                };
                activeCidRef.current = newCid;
                setActiveConversation(realConv);
                navigateToConversation(newCid, true);
                setIsSubmitting(false);
                fetchOverview(true);
                setTimeout(() => fetchConversationDetail(newCid, true), 500);
                return;
            }
        } catch {}

        await streamViaCloudProxy(text, null, mediaToSend);
    };

    const handleCancelRunning = async () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        if (activeConversationId && !activeConversationId.startsWith('local_') && !activeConversationId.startsWith('pending_')) {
            try {
                await dispatchCompanionCommand('cancel', { conversationId: activeConversationId });
            } catch {}
        }
        setIsSubmitting(false);
        onToast('Đã gửi lệnh dừng tác vụ', 'info');
    };

    const handleCopyCode = (code: string, id: string) => {
        navigator.clipboard?.writeText(code);
        setCopiedCodeId(id);
        setTimeout(() => setCopiedCodeId(null), 1800);
    };

    const avatarInitials = (member.username || 'vu').slice(0, 2).toLowerCase();

    // Render clean Markdown in Conversation View (supports both Light Desktop and Dark Mobile themes)
    const renderFormattedContent = (content: string, msgId: string, isLight = false) => {
        if (!content) return null;
        const safeContent = maskEmailsInText(content);
        const segments = safeContent.split(/(```[\s\S]*?```)/g);

        return (
            <div
                className={`space-y-2.5 text-[14.5px] leading-[1.65] break-words ${
                    isLight ? 'text-[#1f1f1f]' : 'text-[#e3e3e3]'
                }`}
            >
                {segments.map((seg, idx) => {
                    if (seg.startsWith('```') && seg.endsWith('```')) {
                        const firstNewLine = seg.indexOf('\n');
                        const lang = firstNewLine > 3 ? seg.slice(3, firstNewLine).trim() : 'code';
                        const codeBody = firstNewLine > -1 ? seg.slice(firstNewLine + 1, -3) : seg.slice(3, -3);
                        const snippetId = `${msgId}_code_${idx}`;
                        const isCopied = copiedCodeId === snippetId;

                        return (
                            <div
                                key={idx}
                                className={`my-2.5 rounded-xl overflow-hidden border ${
                                    isLight ? 'border-[#e0e0de] bg-[#1e1e1e]' : 'border-[#363636] bg-[#141414]'
                                }`}
                            >
                                <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#262626] border-b border-[#343434] text-[12px] text-[#a0a0a0] font-mono">
                                    <span>{lang || 'text'}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleCopyCode(codeBody, snippetId)}
                                        className="flex items-center gap-1 text-[#b8b8b8] hover:text-white transition-colors"
                                    >
                                        {isCopied ? (
                                            <>
                                                <Check className="w-3.5 h-3.5 text-[#57ab5a]" />
                                                <span className="text-[#57ab5a]">Copied</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="w-3.5 h-3.5" />
                                                <span>Copy</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                                <pre className="p-3.5 text-[13px] font-mono text-[#e8e8e8] overflow-x-auto leading-relaxed">
                                    <code>{codeBody}</code>
                                </pre>
                            </div>
                        );
                    }

                    return (
                        <div key={idx} className="space-y-1.5">
                            {seg.split('\n').map((line, lIdx) => {
                                const trimmed = line.trim();
                                if (!trimmed) return <div key={lIdx} className="h-1" />;

                                if (/^(Kế hoạch|Tiến độ):/i.test(trimmed)) {
                                    return (
                                        <div
                                            key={lIdx}
                                            className={`my-1.5 px-3 py-2 rounded-lg border text-[13.5px] font-medium flex items-center gap-2 ${
                                                isLight
                                                    ? 'bg-[#eef4ff] border-[#d0e0ff] text-[#1967d2]'
                                                    : 'bg-[#252525] border-[#3a3a3a] text-[#8ab4f8]'
                                            }`}
                                        >
                                            <Sparkles className="w-4 h-4 shrink-0" />
                                            <span>{trimmed}</span>
                                        </div>
                                    );
                                }

                                if (trimmed.startsWith('### ')) {
                                    return (
                                        <h4
                                            key={lIdx}
                                            className={`text-[15.5px] font-semibold pt-2 pb-0.5 ${
                                                isLight ? 'text-[#111111]' : 'text-white'
                                            }`}
                                        >
                                            {trimmed.slice(4)}
                                        </h4>
                                    );
                                }
                                if (trimmed.startsWith('## ')) {
                                    return (
                                        <h3
                                            key={lIdx}
                                            className={`text-[16.5px] font-bold pt-2.5 pb-1 ${
                                                isLight ? 'text-[#111111]' : 'text-white'
                                            }`}
                                        >
                                            {trimmed.slice(3)}
                                        </h3>
                                    );
                                }
                                if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                                    return (
                                        <div key={lIdx} className="flex items-start gap-2 pl-1">
                                            <span className="text-[#8e8e8e] mt-1.5 text-[10px]">●</span>
                                            <span className="flex-1">{renderInlineTokens(trimmed.slice(2), isLight)}</span>
                                        </div>
                                    );
                                }
                                return <p key={lIdx}>{renderInlineTokens(line, isLight)}</p>;
                            })}
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderInlineTokens = (text: string, isLight = false): React.ReactNode => {
        const normalized = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
            const cleanLabel = label.replace(/^`|`$/g, '');
            if (url.startsWith('http://') || url.startsWith('https://')) {
                return `[[LINK:${cleanLabel}|${url}]]`;
            }
            return `\`${cleanLabel}\``;
        });

        const parts = normalized.split(/(\[\[LINK:[^\]]+\]\]|\*\*`[^`]+`\*\*|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('[[LINK:') && part.endsWith(']]')) {
                const inner = part.slice(7, -2);
                const [lbl, href] = inner.split('|');
                return (
                    <a
                        key={i}
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className={`${
                            isLight ? 'text-[#1967d2]' : 'text-[#8ab4f8]'
                        } underline underline-offset-2 break-all`}
                    >
                        {lbl}
                    </a>
                );
            }
            if (part.startsWith('**`') && part.endsWith('`**') && part.length > 6) {
                return (
                    <code
                        key={i}
                        className={`px-1.5 py-0.5 mx-0.5 rounded font-bold font-mono text-[12.5px] ${
                            isLight ? 'bg-[#eaeae8] text-[#1f1f1f]' : 'bg-[#2c2c2c] text-white'
                        }`}
                    >
                        {part.slice(3, -3)}
                    </code>
                );
            }
            if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
                return (
                    <code
                        key={i}
                        className={`px-1.5 py-0.5 mx-0.5 rounded font-mono text-[12.5px] break-all ${
                            isLight ? 'bg-[#ececea] text-[#c5221f]' : 'bg-[#2c2c2c] text-[#f28b82]'
                        }`}
                    >
                        {part.slice(1, -1)}
                    </code>
                );
            }
            if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
                return (
                    <strong key={i} className={`font-semibold ${isLight ? 'text-[#111111]' : 'text-white'}`}>
                        {part.slice(2, -2).replace(/`/g, '')}
                    </strong>
                );
            }
            if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
                return (
                    <em key={i} className={`italic ${isLight ? 'text-[#4a4a4a]' : 'text-[#c4c7c5]'}`}>
                        {part.slice(1, -1)}
                    </em>
                );
            }
            return part;
        });
    };

    // Filter conversations when search or unread filter is active
    const filterConvList = (list: CompanionConversationItem[]) => {
        return list.filter(item => {
            if (filterUnreadOnly && !item.unread && !item.isRunning) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                return (
                    item.title.toLowerCase().includes(q) ||
                    item.projectName.toLowerCase().includes(q) ||
                    (item.workspaceTag || '').toLowerCase().includes(q)
                );
            }
            return true;
        });
    };

    // Render attached media chips/thumbnails inside Desktop or Mobile composer
    const renderComposerAttachments = (isDark = false) => {
        if (attachedMedia.length === 0) return null;
        return (
            <div className="flex items-center gap-2 pb-2.5 overflow-x-auto">
                {attachedMedia.map((att, i) => {
                    const mime = (att.mimeType || '').toLowerCase();
                    const isImg = mime.startsWith('image/');
                    const isVid = mime.startsWith('video/');
                    const isAud = mime.startsWith('audio/');
                    const srcUrl = resolveMediaUrl(att);
                    return (
                        <div
                            key={att.id || i}
                            className={`relative group shrink-0 rounded-xl overflow-hidden border ${
                                isDark ? 'border-[#444] bg-[#1c1c1c]' : 'border-[#d8d8d4] bg-[#f7f7f5]'
                            }`}
                        >
                            {isImg && srcUrl ? (
                                <div className="w-16 h-16 relative">
                                    <img src={srcUrl} alt={att.name} className="w-full h-full object-cover" />
                                </div>
                            ) : isVid && srcUrl ? (
                                <div className="w-20 h-16 relative flex flex-col items-center justify-center bg-black/80 text-white p-1">
                                    <Film className="w-5 h-5 text-[#8ab4f8]" />
                                    <span className="text-[10px] truncate max-w-[70px] mt-1">{att.name}</span>
                                </div>
                            ) : (
                                <div className="h-14 px-3 flex items-center gap-2 max-w-[200px]">
                                    {isAud ? (
                                        <Music className="w-4 h-4 text-[#ec407a] shrink-0" />
                                    ) : (
                                        <FileText className="w-4 h-4 text-[#1967d2] shrink-0" />
                                    )}
                                    <div className="min-w-0">
                                        <div
                                            className={`text-[12px] font-medium truncate ${
                                                isDark ? 'text-[#e3e3e3]' : 'text-[#1f1f1f]'
                                            }`}
                                        >
                                            {att.name}
                                        </div>
                                        {att.size ? (
                                            <div className="text-[10.5px] text-[#8e8e8e]">
                                                {formatFileSize(att.size)}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => setAttachedMedia(prev => prev.filter((_, idx) => idx !== i))}
                                title="Xóa đính kèm"
                                className="absolute top-1 right-1 bg-black/75 hover:bg-black rounded-full p-0.5 text-white shadow"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    );
                })}
            </div>
        );
    };

    // Render media attachments inside a conversation message bubble
    const renderMessageMedia = (msg: TrajectoryMessage, isLight = false) => {
        const list: MediaAttachment[] = [...(msg.media || [])];
        if (Array.isArray(msg.images)) {
            msg.images.forEach((imgUrl, idx) => {
                if (imgUrl && !list.some(m => m.dataUrl === imgUrl || m.url === imgUrl)) {
                    list.push({
                        name: `image_${idx + 1}.png`,
                        mimeType: 'image/png',
                        dataUrl: imgUrl
                    });
                }
            });
        }
        if (list.length === 0) return null;

        return (
            <div className="flex flex-wrap gap-2 mb-2">
                {list.map((att, idx) => {
                    const mime = (att.mimeType || '').toLowerCase();
                    const src = resolveMediaUrl(att);
                    if (!src) return null;
                    if (mime.startsWith('image/')) {
                        return (
                            <a
                                key={`${msg.id}_med_${idx}`}
                                href={src}
                                target="_blank"
                                rel="noreferrer"
                                className="block rounded-xl overflow-hidden border border-black/10 max-w-[280px] max-h-[260px] shadow-sm hover:opacity-95 transition-opacity"
                            >
                                <img
                                    src={src}
                                    alt={att.name || 'image'}
                                    className="max-w-full max-h-[256px] object-contain bg-black/5"
                                    loading="lazy"
                                />
                            </a>
                        );
                    }
                    if (mime.startsWith('video/')) {
                        return (
                            <div
                                key={`${msg.id}_med_${idx}`}
                                className="rounded-xl overflow-hidden border border-black/15 max-w-[320px] bg-black"
                            >
                                <video src={src} controls preload="metadata" className="max-w-full max-h-[240px]" />
                            </div>
                        );
                    }
                    if (mime.startsWith('audio/')) {
                        return (
                            <div
                                key={`${msg.id}_med_${idx}`}
                                className={`p-2 rounded-xl border ${
                                    isLight ? 'bg-white border-[#d8d8d4]' : 'bg-[#1e1e1e] border-[#3a3a3a]'
                                }`}
                            >
                                <div className="text-[11.5px] mb-1 truncate opacity-80">{att.name}</div>
                                <audio src={src} controls className="h-8 max-w-[250px]" />
                            </div>
                        );
                    }
                    return (
                        <a
                            key={`${msg.id}_med_${idx}`}
                            href={src}
                            target="_blank"
                            rel="noreferrer"
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[12.5px] transition-colors ${
                                isLight
                                    ? 'bg-white border-[#d8d8d4] text-[#1967d2] hover:bg-[#f4f7ff]'
                                    : 'bg-[#1e1e1e] border-[#3a3a3a] text-[#8ab4f8] hover:bg-white/5'
                            }`}
                        >
                            <Paperclip className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate max-w-[200px]">{att.name || 'Tệp đính kèm'}</span>
                        </a>
                    );
                })}
            </div>
        );
    };

    // Render Desktop 2-Layer Composer Box
    const renderDesktopComposer = () => (
        <div className="relative w-full">
            {slashMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl bg-white border border-[#dfdfd8] shadow-xl py-1.5 max-h-56 overflow-y-auto z-40">
                    <div className="px-3.5 py-1 text-[11px] font-medium uppercase tracking-wider text-[#787878]">
                        Actions & Workflows
                    </div>
                    {SLASH_COMMANDS.map(item => (
                        <button
                            key={item.cmd}
                            type="button"
                            onClick={() => {
                                setPromptText(`${item.cmd} `);
                                setSlashMenuOpen(false);
                                desktopTextareaRef.current?.focus();
                            }}
                            className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-black/[0.04] text-left transition-colors"
                        >
                            <span className="text-[13px] font-mono text-[#1967d2] font-medium">{item.cmd}</span>
                            <span className="text-[12.5px] text-[#6e6e6e] truncate ml-3">{item.desc}</span>
                        </button>
                    ))}
                </div>
            )}

            {mentionMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl bg-white border border-[#dfdfd8] shadow-xl py-1.5 max-h-56 overflow-y-auto z-40">
                    <div className="px-3.5 py-1 text-[11px] font-medium uppercase tracking-wider text-[#787878]">
                        Mention Project / Context
                    </div>
                    {projects.map(p => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                                setTargetNewProjectId(p.id);
                                setTargetNewProjectName(p.name);
                                setPromptText(prev => prev.replace(/@\w*$/, `@${p.name} `));
                                setMentionMenuOpen(false);
                                desktopTextareaRef.current?.focus();
                            }}
                            className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-black/[0.04] text-left transition-colors"
                        >
                            <Folder className="w-4 h-4 text-[#787878]" />
                            <span className="text-[13px] text-[#1f1f1f]">{p.name}</span>
                            <span className="text-[12px] text-[#8e8e8e] ml-auto">{p.totalCount} convs</span>
                        </button>
                    ))}
                </div>
            )}

            <div
                onDragOver={e => {
                    e.preventDefault();
                    setIsDraggingMedia(true);
                }}
                onDragLeave={() => setIsDraggingMedia(false)}
                onDrop={handleDropMedia}
                className={`rounded-[16px] bg-[#efefef] border transition-colors shadow-[0_2px_10px_rgba(0,0,0,0.03)] ${
                    isDraggingMedia ? 'border-[#1967d2] ring-2 ring-[#1967d2]/20' : 'border-[#e3e3e0]'
                }`}
            >
                <div className="bg-white rounded-[15px] px-4 pt-3.5 pb-2.5 border-b border-[#e5e5e2]">
                    {renderComposerAttachments(false)}

                    <textarea
                        ref={desktopTextareaRef}
                        rows={1}
                        value={promptText}
                        onChange={handlePromptChange}
                        onPaste={handlePasteMedia}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmitPrompt();
                            }
                        }}
                        placeholder="Ask anything, @ to mention, / for actions (Ctrl+V hoặc kéo thả ảnh/video/file)"
                        className="w-full bg-transparent text-[#1f1f1f] placeholder-[#8e8e8e] text-[14px] leading-relaxed outline-none resize-none max-h-36 min-h-[28px]"
                    />

                    <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 relative">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                title="Add attachment or context"
                                className="p-1 rounded-md text-[#6e6e6e] hover:text-[#1f1f1f] hover:bg-black/[0.04] transition-colors shrink-0"
                            >
                                <Plus className="w-[16px] h-[16px]" />
                            </button>

                            <button
                                type="button"
                                onClick={() => setModelMenuOpen(prev => !prev)}
                                className="flex items-center gap-1.5 py-1 px-2 rounded-md hover:bg-black/[0.04] transition-colors truncate"
                            >
                                <span className="text-[12.5px] text-[#3c3c3c] font-normal truncate">
                                    {selectedModel.name}
                                </span>
                                {selectedModel.tier && (
                                    <span className="text-[12.5px] text-[#8e8e8e] font-normal shrink-0">
                                        {selectedModel.tier}
                                    </span>
                                )}
                                <ChevronDown className="w-3.5 h-3.5 text-[#8e8e8e] shrink-0" />
                            </button>

                            {modelMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setModelMenuOpen(false)} />
                                    <div className="absolute left-6 bottom-full mb-2 w-72 rounded-xl bg-white border border-[#dfdfd8] shadow-xl py-1.5 z-40 max-h-72 overflow-y-auto">
                                        <div className="px-3.5 py-1 text-[11px] font-medium text-[#787878] flex items-center justify-between">
                                            <span>Model</span>
                                            <span>Quota</span>
                                        </div>
                                        {models.map(m => {
                                            const isSelected = selectedModel.id === m.id;
                                            const pct = Math.round((m.remainingFraction ?? 0.99) * 100);
                                            return (
                                                <button
                                                    key={m.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedModel(m);
                                                        setModelMenuOpen(false);
                                                    }}
                                                    className={`w-full px-3.5 py-2 flex items-center justify-between hover:bg-black/[0.04] text-left transition-colors ${
                                                        isSelected ? 'bg-black/[0.03]' : ''
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <span className="text-[13px] text-[#1f1f1f] truncate">
                                                            {m.name}
                                                        </span>
                                                        {m.tier && (
                                                            <span className="text-[12.5px] text-[#787878]">
                                                                {m.tier}
                                                            </span>
                                                        )}
                                                        {m.tag && (
                                                            <span className="px-1.5 py-0.2 text-[10px] rounded bg-[#eef4ff] text-[#1967d2] font-medium">
                                                                {m.tag}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="text-[11.5px] text-[#787878]">{pct}%</span>
                                                        {isSelected && <Check className="w-3.5 h-3.5 text-[#1967d2]" />}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0 relative">
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setExecMenuOpen(prev => !prev)}
                                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[12.5px] text-[#5f6368] hover:text-[#1f1f1f] hover:bg-black/[0.04] transition-colors"
                                >
                                    <ShieldCheck className="w-[14px] h-[14px] text-[#6e6e6e]" />
                                    <span>{execMode}</span>
                                    <ChevronDown className="w-3 h-3 text-[#8e8e8e]" />
                                </button>

                                {execMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-30" onClick={() => setExecMenuOpen(false)} />
                                        <div className="absolute right-0 bottom-full mb-1.5 w-56 rounded-xl bg-white border border-[#dfdfd8] shadow-xl py-1.5 z-40">
                                            {EXEC_MODES.map(mode => (
                                                <button
                                                    key={mode.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setExecMode(mode.id);
                                                        setExecMenuOpen(false);
                                                    }}
                                                    className="w-full px-3 py-2 flex items-start justify-between hover:bg-black/[0.04] text-left"
                                                >
                                                    <div>
                                                        <div className="text-[12.5px] font-medium text-[#1f1f1f]">
                                                            {mode.label}
                                                        </div>
                                                        <div className="text-[11px] text-[#787878]">{mode.desc}</div>
                                                    </div>
                                                    {execMode === mode.id && (
                                                        <Check className="w-3.5 h-3.5 text-[#1967d2] mt-0.5 shrink-0" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={handleVoiceInput}
                                title="Voice input"
                                className={`p-1.5 rounded-full transition-colors ${
                                    isListeningVoice
                                        ? 'text-[#d93025] bg-[#fce8e6] animate-pulse'
                                        : 'text-[#6e6e6e] hover:text-[#1f1f1f] hover:bg-black/[0.04]'
                                }`}
                            >
                                <Mic className="w-[15px] h-[15px]" />
                            </button>

                            {isSubmitting ? (
                                <button
                                    type="button"
                                    onClick={handleCancelRunning}
                                    title="Stop"
                                    className="w-7 h-7 rounded-full bg-[#fce8e6] hover:bg-[#f8d7da] text-[#d93025] flex items-center justify-center transition-all"
                                >
                                    <Square className="w-3 h-3 fill-current" />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleSubmitPrompt}
                                    disabled={!promptText.trim() && attachedMedia.length === 0}
                                    title="Submit"
                                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                                        promptText.trim() || attachedMedia.length > 0
                                            ? 'bg-[#1f1f1f] text-white shadow-sm'
                                            : 'bg-[#e4e4e2] text-[#6e6e6e]'
                                    }`}
                                >
                                    <ArrowRight className="w-[15px] h-[15px]" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="px-3.5 py-1.5 flex items-center justify-between text-[12px] text-[#5f6368] relative">
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setEnvMenuOpen(prev => !prev)}
                            className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-black/[0.04] hover:text-[#1f1f1f] transition-colors"
                        >
                            <Laptop className="w-[13.5px] h-[13.5px] text-[#6e6e6e]" />
                            <span>{envMode}</span>
                            <ChevronDown className="w-3 h-3 text-[#8e8e8e]" />
                        </button>

                        {envMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-30" onClick={() => setEnvMenuOpen(false)} />
                                <div className="absolute left-0 bottom-full mb-1.5 w-52 rounded-xl bg-white border border-[#dfdfd8] shadow-xl py-1.5 z-40">
                                    {ENV_MODES.map(env => (
                                        <button
                                            key={env.id}
                                            type="button"
                                            onClick={() => {
                                                setEnvMode(env.id);
                                                setEnvMenuOpen(false);
                                            }}
                                            className="w-full px-3 py-2 flex items-start justify-between hover:bg-black/[0.04] text-left"
                                        >
                                            <div>
                                                <div className="text-[12.5px] font-medium text-[#1f1f1f]">
                                                    {env.label}
                                                </div>
                                                <div className="text-[11px] text-[#787878]">{env.desc}</div>
                                            </div>
                                            {envMode === env.id && (
                                                <Check className="w-3.5 h-3.5 text-[#1967d2] mt-0.5 shrink-0" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="w-full h-dvh overflow-hidden select-none font-sans relative">
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,audio/*,.pdf,.txt,.md,.json,.csv,.zip,.doc,.docx,.xls,.xlsx,.py,.ts,.tsx,.js"
                className="hidden"
                onChange={e => {
                    handleFilesSelected(e.target.files);
                    e.target.value = '';
                }}
            />

            {/* =========================================================================================
                A. DESKTOP WEB & PC APP LAYOUT (>= 768px / md:flex)
                   Exact match to Antigravity PC App & Web (media_1792632335107_3b0e7514.png)
               ========================================================================================= */}
            <div className="hidden md:flex w-full h-full bg-[#f9f9f8] text-[#1f1f1f] overflow-hidden">
                {/* 1. LEFT SIDEBAR (280px, clean hidden scrollbar, exact PC App controls) */}
                {desktopSidebarOpen && (
                    <aside className="w-[300px] h-full bg-[#f3f3f2] border-r border-[#e6e6e4] flex flex-col shrink-0 select-none">
                        {/* Top Header matching PC App: [A Logo]  [◧]  [←]  [→]  [🔍] */}
                        <div className="px-3.5 pt-3 pb-2 flex items-center gap-2.5">
                            <button
                                type="button"
                                onClick={() => handleStartNewInProject()}
                                title="Antigravity Home"
                                className="p-1 rounded-md hover:bg-black/[0.04] transition-colors"
                            >
                                <AntigravityMonoLogo className="w-[18px] h-[18px]" />
                            </button>

                            <button
                                type="button"
                                onClick={() => setDesktopSidebarOpen(false)}
                                title="Toggle sidebar"
                                className="p-1 rounded-md text-[#5f6368] hover:text-[#1f1f1f] hover:bg-black/[0.04] transition-colors"
                            >
                                <PanelLeft className="w-[15px] h-[15px]" />
                            </button>

                            <button
                                type="button"
                                onClick={handleNavBack}
                                disabled={navIndex <= 0}
                                title="Navigate back"
                                className={`p-1 rounded-md transition-colors ${
                                    navIndex > 0
                                        ? 'text-[#5f6368] hover:text-[#1f1f1f] hover:bg-black/[0.04]'
                                        : 'text-[#c4c4c0] cursor-default'
                                }`}
                            >
                                <ArrowLeft className="w-[15px] h-[15px]" />
                            </button>

                            <button
                                type="button"
                                onClick={handleNavForward}
                                disabled={navIndex >= navHistory.length - 1}
                                title="Navigate forward"
                                className={`p-1 rounded-md transition-colors ${
                                    navIndex < navHistory.length - 1
                                        ? 'text-[#5f6368] hover:text-[#1f1f1f] hover:bg-black/[0.04]'
                                        : 'text-[#c4c4c0] cursor-default'
                                }`}
                            >
                                <ArrowRight className="w-[15px] h-[15px]" />
                            </button>

                            <button
                                type="button"
                                onClick={() => setSearchBarOpen(prev => !prev)}
                                title="Search conversations"
                                className="p-1 rounded-md text-[#5f6368] hover:text-[#1f1f1f] hover:bg-black/[0.04] transition-colors"
                            >
                                <Search className="w-[15px] h-[15px]" />
                            </button>
                        </div>

                        {/* Inline Search Input when Search icon clicked */}
                        {searchBarOpen && (
                            <div className="px-3 pb-2">
                                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] bg-white border border-[#dfdfd8]">
                                    <Search className="w-3.5 h-3.5 text-[#8e8e8e] shrink-0" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        placeholder="Search conversations..."
                                        className="w-full bg-transparent text-[12.5px] text-[#1f1f1f] placeholder-[#8e8e8e] outline-none"
                                        autoFocus
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchQuery('')}
                                            className="text-[#8e8e8e] hover:text-[#1f1f1f]"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Primary Navigation Buttons matching PC App:
                            + New Conversation
                            🕒 Conversation History
                            ⏱ Automations
                            🗂 Customizations */}
                        <div className="px-3 space-y-0.5">
                            <button
                                type="button"
                                onClick={() => handleStartNewInProject()}
                                className="w-full px-3 py-1.5 mb-1 rounded-[8px] bg-white hover:bg-[#fcfcfb] border border-[#e2e2df] shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex items-center gap-2 text-[13px] text-[#1f1f1f] font-normal transition-all"
                            >
                                <Plus className="w-[15px] h-[15px] text-[#4a4a4a]" />
                                <span>New Conversation</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setHistoryModalOpen(true)}
                                className="w-full px-2.5 py-1.5 rounded-[8px] hover:bg-black/[0.04] flex items-center gap-2.5 text-[13px] text-[#3c3c3c] font-normal transition-colors"
                            >
                                <History className="w-[15px] h-[15px] text-[#5f6368]" />
                                <span>Conversation History</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setAutomationsModalOpen(true)}
                                className="w-full px-2.5 py-1.5 rounded-[8px] hover:bg-black/[0.04] flex items-center gap-2.5 text-[13px] text-[#3c3c3c] font-normal transition-colors"
                            >
                                <Clock className="w-[15px] h-[15px] text-[#5f6368]" />
                                <span>Automations</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setCustomizationsModalOpen(true)}
                                className="w-full px-2.5 py-1.5 rounded-[8px] hover:bg-black/[0.04] flex items-center gap-2.5 text-[13px] text-[#3c3c3c] font-normal transition-colors"
                            >
                                <Archive className="w-[15px] h-[15px] text-[#5f6368]" />
                                <span>Customizations</span>
                            </button>
                        </div>

                        {/* Scrollable Pinned Conversations & Projects Tree (No ugly native scrollbar!) */}
                        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                            {/* Pinned Conversations */}
                            {pinnedConversations.length > 0 && (
                                <div>
                                    <div className="px-1.5 mb-1 text-[11.5px] text-[#787878] font-normal">
                                        Pinned Conversations
                                    </div>
                                    <div className="space-y-0.5">
                                        {filterConvList(pinnedConversations).map(conv => {
                                            const isActive = activeConversationId === conv.id;
                                            return (
                                                <div
                                                    key={`desk_pin_${conv.id}`}
                                                    onClick={() => handleOpenConversation(conv)}
                                                    className={`px-2 py-1.5 rounded-[8px] cursor-pointer transition-colors ${
                                                        isActive
                                                            ? 'bg-[#e3e3e0] font-medium text-[#111111]'
                                                            : 'hover:bg-black/[0.04]'
                                                    }`}
                                                >
                                                    <div className="flex items-baseline justify-between gap-2">
                                                        <span className="text-xs text-[#1f1f1f] leading-snug break-words">
                                                            {maskEmailsInText(conv.title)}
                                                        </span>
                                                        <span className="text-[11.5px] text-[#787878] shrink-0">
                                                            {conv.relativeTime}
                                                        </span>
                                                    </div>
                                                    <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-[#787878]">
                                                        <Folder className="w-3 h-3 text-[#8e8e8e] shrink-0" />
                                                        <span className="truncate">{conv.projectName}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Projects */}
                            <div>
                                <div className="px-1.5 mb-1 flex items-center justify-between">
                                    <span className="text-[11.5px] text-[#787878] font-normal">Projects</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setFilterUnreadOnly(prev => !prev)}
                                            title="Filter unread / running conversations"
                                            className={`p-0.5 rounded hover:bg-black/[0.05] transition-colors ${
                                                filterUnreadOnly ? 'text-[#3b82f6]' : 'text-[#787878]'
                                            }`}
                                        >
                                            <ListFilter className="w-[14px] h-[14px]" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setNewProjectModalOpen(true)}
                                            title="Select or add project"
                                            className="p-0.5 rounded text-[#787878] hover:text-[#1f1f1f] hover:bg-black/[0.05] transition-colors"
                                        >
                                            <FolderPlus className="w-[14px] h-[14px]" />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {projects.map(proj => {
                                        const isCollapsed = !!collapsedProjects[proj.id];
                                        const isExpandedAll = !!expandedSeeAllProjects[proj.id];
                                        const filteredConvs = filterConvList(proj.conversations);
                                        // Show 16 conversations under AG / primary PC project by default
                                        const defaultLimit = proj.name === 'AG' || proj.id.startsWith('ag-pc-') ? 16 : 4;
                                        const visibleConvs = isExpandedAll
                                            ? filteredConvs
                                            : filteredConvs.slice(0, defaultLimit);

                                        return (
                                            <div key={`desk_proj_${proj.id}`} className="space-y-0.5">
                                                {/* Project Folder Row */}
                                                <div
                                                    onClick={() =>
                                                        setCollapsedProjects(prev => ({
                                                            ...prev,
                                                            [proj.id]: !prev[proj.id]
                                                        }))
                                                    }
                                                    className="group flex items-center justify-between px-1.5 py-1 rounded-[7px] hover:bg-black/[0.04] cursor-pointer transition-colors"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <Folder className="w-[14px] h-[14px] text-[#6e6e6e] shrink-0" />
                                                        <span className="text-[13px] text-[#4a4a4a] truncate">
                                                            {proj.name}
                                                        </span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={e => handleStartNewInProject(proj, e)}
                                                        title={`New conversation in ${proj.name}`}
                                                        className="p-0.5 rounded text-[#6e6e6e] hover:text-[#1f1f1f] opacity-0 group-hover:opacity-100 hover:bg-black/[0.05] transition-all"
                                                    >
                                                        <Plus className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>

                                                {/* Indented Conversations */}
                                                {!isCollapsed && (
                                                    <div className="space-y-0.5">
                                                        {visibleConvs.map(conv => {
                                                            const isActive = activeConversationId === conv.id;
                                                            return (
                                                                <div
                                                                    key={`desk_conv_${conv.id}`}
                                                                    onClick={() => handleOpenConversation(conv)}
                                                                    className={`flex items-center justify-between pl-6 pr-2 py-1.5 rounded-[8px] cursor-pointer transition-colors gap-2 ${
                                                                        isActive
                                                                            ? 'bg-[#e3e3e0] font-medium text-[#111111]'
                                                                            : 'text-[#2c2c2c] hover:bg-black/[0.04]'
                                                                    }`}
                                                                >
                                                                    <span className="text-xs leading-snug break-words">
                                                                        {maskEmailsInText(
                                                                            conv.workspaceTag
                                                                                ? `Claude giao · ${conv.workspaceTag} · ${conv.title}`
                                                                                : conv.title
                                                                        )}
                                                                    </span>

                                                                    {/* Right indicator matching PC App (media_1792632335107_3b0e7514.png):
                                                                        1. If conv.isRunning && !isActive -> Spinning circular arc loader (C)
                                                                        2. Else if conv.unread && !isActive -> Blue dot with soft blue halo (●)
                                                                        3. Else -> relativeTime (2m, 4m, 22m, 8h, 12h...) */}
                                                                    <div className="shrink-0 flex items-center justify-end min-w-[24px]">
                                                                        {conv.isRunning && !isActive ? (
                                                                            <PcRunningArcSpinner className="w-[14px] h-[14px] text-[#5f6368]" />
                                                                        ) : conv.unread && !isActive ? (
                                                                            <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                                                                                <span className="absolute inline-flex h-3 w-3 rounded-full bg-[#3b82f6]/20" />
                                                                                <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-[#3b82f6]" />
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-[11.5px] text-[#787878] font-normal">
                                                                                {conv.relativeTime}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}

                                                        {proj.totalCount > defaultLimit && (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setExpandedSeeAllProjects(prev => ({
                                                                        ...prev,
                                                                        [proj.id]: !prev[proj.id]
                                                                    }))
                                                                }
                                                                className="pl-6 pr-2 py-1 text-[12px] text-[#787878] hover:text-[#1f1f1f] transition-colors block text-left"
                                                            >
                                                                {isExpandedAll
                                                                    ? 'Show less'
                                                                    : `See all (${proj.totalCount})`}
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Bottom Footer of Left Sidebar: Host Selector Box + Settings */}
                        <div className="p-2.5 pt-2 border-t border-[#e6e6e4] space-y-1.5 bg-[#f3f3f2] relative">
                            <button
                                type="button"
                                onClick={() => setHostMenuOpen(prev => !prev)}
                                className="w-full px-3 py-2 rounded-[8px] bg-white hover:bg-[#fcfcfb] border border-[#dfdfd8] shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex items-center justify-between transition-colors"
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <span
                                        className={`w-2 h-2 rounded-full shrink-0 ${
                                            wsLiveConnected ? 'bg-[#2e7d32]' : 'bg-[#fbbc04]'
                                        }`}
                                    />
                                    <span className="text-[12.5px] font-medium text-[#1f1f1f] truncate">
                                        {hostName}
                                    </span>
                                </div>
                                <ChevronDown className="w-3.5 h-3.5 text-[#6e6e6e] shrink-0" />
                            </button>

                            {hostMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setHostMenuOpen(false)} />
                                    <div className="absolute left-2.5 right-2.5 bottom-20 rounded-xl bg-white border border-[#dfdfd8] shadow-xl py-1.5 z-40">
                                        <div className="px-3 py-1 text-[10.5px] font-medium uppercase tracking-wider text-[#787878] flex items-center justify-between">
                                            <span>Connected Host</span>
                                            <span className="text-[#2e7d32] font-semibold">WS Realtime</span>
                                        </div>
                                        {hostInstances.map(inst => (
                                            <button
                                                key={inst.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedHostId(inst.id);
                                                    setHostName(inst.name);
                                                    setHostMenuOpen(false);
                                                    fetchOverview();
                                                }}
                                                className="w-full px-3 py-2 flex items-center justify-between hover:bg-black/[0.04] text-left"
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="w-2 h-2 rounded-full bg-[#2e7d32] shrink-0" />
                                                    <div className="truncate">
                                                        <div className="text-[12.5px] font-medium text-[#1f1f1f] truncate">
                                                            {inst.name}
                                                        </div>
                                                        <div className="text-[11px] text-[#787878] truncate">
                                                            {inst.label}
                                                        </div>
                                                    </div>
                                                </div>
                                                {selectedHostId === inst.id && (
                                                    <Check className="w-3.5 h-3.5 text-[#1967d2] shrink-0" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}

                            <div className="flex items-center justify-between pt-0.5">
                                <button
                                    type="button"
                                    onClick={() => setSettingsModalOpen(true)}
                                    className="px-2 py-1 rounded-[7px] hover:bg-black/[0.04] flex items-center gap-2 text-[12.5px] text-[#3c3c3c] transition-colors"
                                >
                                    <Settings className="w-[14px] h-[14px] text-[#6e6e6e]" />
                                    <span>Settings</span>
                                </button>
                            </div>
                        </div>
                    </aside>
                )}

                {/* 2. RIGHT MAIN CANVAS ON DESKTOP */}
                <main className="flex-1 h-full flex flex-col bg-[#f9f9f8] relative overflow-hidden">
                    {/* Top Header Bar of Right Canvas */}
                    <div className="h-[52px] px-4 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2.5 min-w-0">
                            {!desktopSidebarOpen && (
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setDesktopSidebarOpen(true)}
                                        title="Expand sidebar"
                                        className="p-1.5 rounded-md text-[#5f6368] hover:text-[#1f1f1f] hover:bg-black/[0.04] transition-colors"
                                    >
                                        <PanelLeft className="w-[16px] h-[16px]" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleStartNewInProject()}
                                        className="px-2.5 py-1 rounded-md bg-white border border-[#e2e2e0] text-[12.5px] text-[#1f1f1f] hover:bg-[#fcfcfb] flex items-center gap-1.5"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>New</span>
                                    </button>
                                </div>
                            )}

                            {activeConversationId && (
                                <div className="flex items-center gap-2 min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => navigateToConversation(null, true)}
                                        className="p-1 rounded-md text-[#6e6e6e] hover:text-[#1f1f1f] hover:bg-black/[0.04]"
                                        title="Back to New Conversation"
                                    >
                                        <ArrowLeft className="w-4 h-4" />
                                    </button>
                                    <span className="flex items-center gap-1 text-[12.5px] text-[#6e6e6e] shrink-0">
                                        <Folder className="w-3.5 h-3.5" />
                                        {activeConversation?.projectName || targetNewProjectName}
                                    </span>
                                    <span className="text-[#c4c4c0]">/</span>
                                    <span className="text-[13.5px] font-medium text-[#1f1f1f] truncate max-w-[440px]">
                                        {maskEmailsInText(activeConversation?.title || 'Loading conversation...')}
                                    </span>
                                    {activeConversation?.isRunning && (
                                        <PcRunningArcSpinner className="w-3.5 h-3.5 text-[#1967d2] shrink-0" />
                                    )}
                                    {activeConversation && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleTogglePin(activeConversation.id, activeConversation.pinned)
                                            }
                                            title={activeConversation.pinned ? 'Unpin' : 'Pin conversation'}
                                            className={`p-1 rounded-md transition-colors ${
                                                activeConversation.pinned
                                                    ? 'text-[#1967d2] bg-[#eef4ff]'
                                                    : 'text-[#787878] hover:text-[#1f1f1f] hover:bg-black/[0.04]'
                                            }`}
                                        >
                                            <Pin className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Top-Right Icons: Feedback (💬!) + User Avatar ('vu') with Google 4-color ring */}
                        <div className="flex items-center gap-2.5 ml-auto shrink-0">
                            <button
                                type="button"
                                onClick={() => {
                                    if (onBackToPortal) {
                                        onBackToPortal();
                                    } else {
                                        setSettingsModalOpen(true);
                                    }
                                }}
                                title={onBackToPortal ? 'Quay về Cổng Thành Viên' : 'Send feedback'}
                                className="p-1.5 rounded-full text-[#5f6368] hover:text-[#1f1f1f] hover:bg-black/[0.04] transition-colors"
                            >
                                <MessageSquareWarning className="w-[17px] h-[17px]" />
                            </button>

                            <button
                                type="button"
                                onClick={() => setSettingsModalOpen(true)}
                                title={`Account: ${member.username}`}
                                className="p-[2px] rounded-full bg-gradient-to-tr from-[#4285F4] via-[#34A853] to-[#FBBC05] shrink-0 active:scale-95 transition-transform"
                            >
                                <div className="w-7 h-7 rounded-full bg-[#004d40] text-white text-[12px] font-semibold flex items-center justify-center tracking-tight">
                                    {avatarInitials}
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Main Body of Right Canvas */}
                    {!activeConversationId ? (
                        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-16">
                            <div className="w-full max-w-[660px]">
                                <div className="mb-2 flex items-center relative">
                                    <button
                                        type="button"
                                        onClick={() => setDesktopProjectMenuOpen(prev => !prev)}
                                        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[13px] text-[#5f6368] hover:text-[#1f1f1f] hover:bg-black/[0.04] transition-colors"
                                    >
                                        <Folder className="w-[15px] h-[15px] text-[#787878]" />
                                        <span>{targetNewProjectName}</span>
                                        <ChevronDown className="w-3.5 h-3.5 text-[#787878]" />
                                    </button>

                                    {desktopProjectMenuOpen && (
                                        <>
                                            <div
                                                className="fixed inset-0 z-30"
                                                onClick={() => setDesktopProjectMenuOpen(false)}
                                            />
                                            <div className="absolute left-0 top-full mt-1 w-64 rounded-xl bg-white border border-[#dfdfd8] shadow-xl py-1.5 z-40 max-h-64 overflow-y-auto">
                                                <div className="px-3 py-1 text-[11px] font-medium text-[#787878]">
                                                    Select Workspace Project
                                                </div>
                                                {projects.map(p => (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setTargetNewProjectId(p.id);
                                                            setTargetNewProjectName(p.name);
                                                            setDesktopProjectMenuOpen(false);
                                                        }}
                                                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-black/[0.04] text-left"
                                                    >
                                                        <div className="flex items-center gap-2 truncate">
                                                            <Folder className="w-3.5 h-3.5 text-[#787878] shrink-0" />
                                                            <span className="text-[13px] text-[#1f1f1f] truncate">
                                                                {p.name}
                                                            </span>
                                                        </div>
                                                        {targetNewProjectId === p.id && (
                                                            <Check className="w-3.5 h-3.5 text-[#1967d2] shrink-0" />
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>

                                {renderDesktopComposer()}
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                            <div className="flex-1 overflow-y-auto px-6 py-4">
                                <div className="max-w-[740px] mx-auto space-y-5 pb-6">
                                    {isLoadingConversation && !activeConversation ? (
                                        <div className="py-20 flex flex-col items-center justify-center gap-2.5 text-[#787878]">
                                            <Loader2 className="w-6 h-6 animate-spin text-[#1967d2]" />
                                            <span className="text-[13.5px]">Loading conversation trajectory...</span>
                                        </div>
                                    ) : activeConversation?.messages && activeConversation.messages.length > 0 ? (
                                        activeConversation.messages.map(msg => {
                                            if (msg.role === 'user') {
                                                return (
                                                    <div key={`desk_m_${msg.id}`} className="flex justify-end">
                                                        <div className="max-w-[82%] rounded-2xl bg-[#ececea] border border-[#dfdfd8] px-4 py-2.5 text-[14.5px] text-[#1f1f1f] leading-relaxed whitespace-pre-wrap break-words">
                                                            {renderMessageMedia(msg, true)}
                                                            {msg.content ? maskEmailsInText(msg.content) : null}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            const isThinkOpen = !!expandedThinking[msg.id];
                                            return (
                                                <div key={`desk_m_${msg.id}`} className="space-y-2.5">
                                                    {msg.thinking && (
                                                        <div className="rounded-xl bg-white border border-[#e3e3e0] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setExpandedThinking(prev => ({
                                                                        ...prev,
                                                                        [msg.id]: !prev[msg.id]
                                                                    }))
                                                                }
                                                                className="w-full px-3.5 py-2 flex items-center justify-between text-[12.5px] text-[#5f6368] hover:text-[#1f1f1f] transition-colors"
                                                            >
                                                                <span className="flex items-center gap-2">
                                                                    <Sparkles className="w-3.5 h-3.5 text-[#1967d2]" />
                                                                    <span>
                                                                        Thought
                                                                        {msg.thinkingSeconds
                                                                            ? ` for ${msg.thinkingSeconds}s`
                                                                            : ''}
                                                                    </span>
                                                                </span>
                                                                {isThinkOpen ? (
                                                                    <ChevronUp className="w-4 h-4" />
                                                                ) : (
                                                                    <ChevronRight className="w-4 h-4" />
                                                                )}
                                                            </button>
                                                            {isThinkOpen && (
                                                                <div className="px-3.5 pb-3 pt-1.5 text-[12.5px] text-[#5f6368] border-t border-[#ededeb] whitespace-pre-wrap leading-relaxed font-mono bg-[#fcfcfb]">
                                                                    {maskEmailsInText(msg.thinking)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                                                        <div className="space-y-1.5">
                                                            {msg.toolCalls.map((tc, tIdx) => {
                                                                const toolKey = `${msg.id}_tool_${tIdx}`;
                                                                const isToolOpen = !!expandedTools[toolKey];
                                                                const isCmd =
                                                                    tc.name.includes('command') ||
                                                                    tc.name.includes('terminal');

                                                                return (
                                                                    <div
                                                                        key={toolKey}
                                                                        className="rounded-xl bg-white border border-[#e3e3e0] overflow-hidden"
                                                                    >
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                setExpandedTools(prev => ({
                                                                                    ...prev,
                                                                                    [toolKey]: !prev[toolKey]
                                                                                }))
                                                                            }
                                                                            className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left text-[12.5px] text-[#3c3c3c] hover:bg-black/[0.02]"
                                                                        >
                                                                            <div className="flex items-center gap-2 min-w-0">
                                                                                {isCmd ? (
                                                                                    <Terminal className="w-3.5 h-3.5 text-[#1967d2] shrink-0" />
                                                                                ) : (
                                                                                    <FileCode className="w-3.5 h-3.5 text-[#188038] shrink-0" />
                                                                                )}
                                                                                <span className="truncate font-mono">
                                                                                    {tc.summary ||
                                                                                        tc.path ||
                                                                                        tc.command ||
                                                                                        tc.name}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                                {tc.status === 'running' ? (
                                                                                    <PcRunningArcSpinner className="w-3.5 h-3.5 text-[#1967d2]" />
                                                                                ) : (
                                                                                    <CheckCircle2 className="w-3.5 h-3.5 text-[#188038]" />
                                                                                )}
                                                                                <ChevronDown
                                                                                    className={`w-3.5 h-3.5 text-[#787878] transition-transform ${
                                                                                        isToolOpen ? 'rotate-180' : ''
                                                                                    }`}
                                                                                />
                                                                            </div>
                                                                        </button>

                                                                        {isToolOpen &&
                                                                            (tc.command || tc.path || tc.output) && (
                                                                                <div className="px-3 py-2 bg-[#1e1e1e] text-[12px] font-mono text-[#d4d4d4] space-y-1.5 overflow-x-auto">
                                                                                    {tc.command && (
                                                                                        <div className="text-[#8ab4f8]">
                                                                                            $ {tc.command}
                                                                                        </div>
                                                                                    )}
                                                                                    {tc.path && (
                                                                                        <div className="text-[#81c995]">
                                                                                            File: {tc.path}
                                                                                        </div>
                                                                                    )}
                                                                                    {tc.output && (
                                                                                        <pre className="text-[#c4c4c4] whitespace-pre-wrap max-h-52 overflow-y-auto">
                                                                                            {maskEmailsInText(tc.output)}
                                                                                        </pre>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}

                                                    {renderMessageMedia(msg, true)}
                                                    {msg.content && (
                                                        <div className="pl-0.5">
                                                            {renderFormattedContent(msg.content, msg.id, true)}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="py-12 text-center text-[13.5px] text-[#787878]">
                                            No steps recorded yet. Enter a message below to continue.
                                        </div>
                                    )}
                                    <div ref={desktopMessagesEndRef} />
                                </div>
                            </div>

                            <div className="px-6 pb-4 pt-2 bg-[#f9f9f8] shrink-0">
                                <div className="max-w-[680px] mx-auto">{renderDesktopComposer()}</div>
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {/* =========================================================================================
                B. MOBILE LAYOUT (< 768px / flex md:hidden)
                   Exact match to antigravity.google.com Mobile screenshot (media_1792595381439_149d9a7b.png)
               ========================================================================================= */}
            <div className="flex md:hidden flex-col w-full h-full bg-[#191919] text-[#e3e3e3] overflow-hidden relative">
                {/* 1. MOBILE TOP NAVIGATION BAR */}
                <header className="h-[54px] px-3 bg-[#191919] border-b border-[#282828] flex items-center justify-between gap-1.5 shrink-0 z-20">
                    <div className="flex items-center gap-2 min-w-0">
                        <button
                            type="button"
                            onClick={() => {
                                if (activeConversationId) {
                                    navigateToConversation(null, true);
                                } else if (onBackToPortal) {
                                    onBackToPortal();
                                }
                            }}
                            title={activeConversationId ? 'Quay lại danh sách Projects' : 'Trang chủ Antigravity'}
                            className="p-0.5 rounded-lg hover:bg-white/5 active:scale-95 transition-all shrink-0"
                        >
                            <AntigravityRibbonLogo className="w-[24px] h-[24px]" />
                        </button>

                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setHostMenuOpen(prev => !prev)}
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-[9px] bg-[#222222] hover:bg-[#2a2a2a] border border-[#383838] transition-colors"
                            >
                                <span
                                    className={`w-2 h-2 rounded-full shrink-0 ${
                                        wsLiveConnected ? 'bg-[#57ab5a]' : 'bg-[#fbbc04]'
                                    }`}
                                />
                                <span className="text-[13px] text-[#e3e3e3] whitespace-nowrap font-normal tracking-tight">
                                    {hostName}
                                </span>
                                <ChevronDown className="w-3.5 h-3.5 text-[#9e9e9e] shrink-0 ml-0.5" />
                            </button>

                            {hostMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setHostMenuOpen(false)} />
                                    <div className="absolute left-0 mt-1.5 w-64 rounded-xl bg-[#252525] border border-[#3a3a3a] shadow-2xl py-1.5 z-40">
                                        <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[#8e8e8e]">
                                            Connected Machines
                                        </div>
                                        {hostInstances.map(inst => (
                                            <button
                                                key={inst.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedHostId(inst.id);
                                                    setHostName(inst.name);
                                                    setHostMenuOpen(false);
                                                    fetchOverview();
                                                }}
                                                className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-white/5 text-left transition-colors"
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <span className="w-2 h-2 rounded-full bg-[#57ab5a] shrink-0" />
                                                    <div className="truncate">
                                                        <div className="text-[13.5px] text-[#e3e3e3] truncate">
                                                            {inst.name}
                                                        </div>
                                                        <div className="text-[11.5px] text-[#8e8e8e] truncate">
                                                            {inst.label}
                                                        </div>
                                                    </div>
                                                </div>
                                                {selectedHostId === inst.id && (
                                                    <Check className="w-4 h-4 text-[#8ab4f8] shrink-0" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                        <button
                            type="button"
                            onClick={() => setSettingsModalOpen(true)}
                            title="Cài đặt Antigravity"
                            className="p-1.5 rounded-full text-[#9e9e9e] hover:text-[#e3e3e3] hover:bg-white/5 transition-colors"
                        >
                            <Settings className="w-[17px] h-[17px]" />
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                if (activeConversationId) {
                                    fetchConversationDetail(activeConversationId, false);
                                }
                                fetchOverview(false);
                            }}
                            title="Làm mới dữ liệu phiên"
                            className="p-1.5 rounded-full text-[#9e9e9e] hover:text-[#e3e3e3] hover:bg-white/5 transition-colors"
                        >
                            <RefreshCw
                                className={`w-[17px] h-[17px] ${isRefreshing ? 'animate-spin text-[#8ab4f8]' : ''}`}
                            />
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                if (onBackToPortal) {
                                    onBackToPortal();
                                } else {
                                    setSearchBarOpen(prev => !prev);
                                }
                            }}
                            title={onBackToPortal ? 'Quay về Menu Cổng Thành Viên' : 'Tìm kiếm nhanh'}
                            className="p-1.5 rounded-full text-[#9e9e9e] hover:text-[#e3e3e3] hover:bg-white/5 transition-colors"
                        >
                            <MessageSquareWarning className="w-[17px] h-[17px]" />
                        </button>

                        <button
                            type="button"
                            onClick={() => setSettingsModalOpen(true)}
                            className="ml-1 p-[2px] rounded-full bg-gradient-to-tr from-[#4285F4] via-[#34A853] to-[#FBBC05] shrink-0 active:scale-95 transition-transform"
                            title={`Tài khoản: ${member.username}`}
                        >
                            <div className="w-7 h-7 rounded-full bg-[#004d40] text-white text-[12.5px] font-semibold flex items-center justify-center tracking-tight">
                                {avatarInitials}
                            </div>
                        </button>
                    </div>
                </header>

                {/* 2. MOBILE MAIN CONTENT */}
                {!activeConversationId ? (
                    <div className="flex-1 overflow-y-auto px-4 pt-3 pb-36 space-y-5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        {targetNewProjectName && targetNewProjectName !== defaultProjectName && (
                            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#242424] border border-[#383838] text-[12.5px] text-[#b0b0b0]">
                                <span className="flex items-center gap-1.5">
                                    <Folder className="w-3.5 h-3.5 text-[#8ab4f8]" />
                                    Đang chọn dự án mới: <strong className="text-white">{targetNewProjectName}</strong>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTargetNewProjectId(defaultProjectId);
                                        setTargetNewProjectName(defaultProjectName);
                                    }}
                                    className="text-[#8e8e8e] hover:text-white"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}

                        {pinnedConversations.length > 0 && (
                            <section>
                                <button
                                    type="button"
                                    onClick={() => setPinnedSectionOpen(prev => !prev)}
                                    className="flex items-center gap-1.5 text-[13.5px] text-[#9e9e9e] hover:text-[#e3e3e3] py-1.5 transition-colors"
                                >
                                    <span>Pinned Conversations</span>
                                    <ChevronDown
                                        className={`w-3.5 h-3.5 transition-transform ${
                                            pinnedSectionOpen ? '' : '-rotate-90'
                                        }`}
                                    />
                                </button>

                                {pinnedSectionOpen && (
                                    <div className="mt-1 space-y-1">
                                        {filterConvList(pinnedConversations).map(conv => (
                                            <div
                                                key={`mob_pin_${conv.id}`}
                                                onClick={() => handleOpenConversation(conv)}
                                                className="group py-2 px-1.5 -mx-1.5 rounded-lg hover:bg-white/[0.04] active:bg-white/[0.08] cursor-pointer transition-colors"
                                            >
                                                <div className="flex items-baseline justify-between gap-3">
                                                    <span className="text-[15.5px] text-[#e3e3e3] font-normal truncate">
                                                        {maskEmailsInText(conv.title)}
                                                    </span>
                                                    <span className="text-[13px] text-[#8e8e8e] shrink-0">
                                                        {conv.relativeTime}
                                                    </span>
                                                </div>
                                                <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[#8e8e8e]">
                                                    <Folder className="w-3.5 h-3.5 text-[#8e8e8e] shrink-0" />
                                                    <span className="truncate">{conv.projectName}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}

                        <section>
                            <div className="flex items-center justify-between py-1.5">
                                <button
                                    type="button"
                                    onClick={() => setProjectsSectionOpen(prev => !prev)}
                                    className="flex items-center gap-1.5 text-[13.5px] text-[#9e9e9e] hover:text-[#e3e3e3] transition-colors"
                                >
                                    <span>Projects</span>
                                    <ChevronDown
                                        className={`w-3.5 h-3.5 transition-transform ${
                                            projectsSectionOpen ? '' : '-rotate-90'
                                        }`}
                                    />
                                </button>

                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setFilterUnreadOnly(prev => !prev)}
                                        className={`p-1 rounded hover:bg-white/5 transition-colors ${
                                            filterUnreadOnly ? 'text-[#ec407a]' : 'text-[#9e9e9e] hover:text-[#e3e3e3]'
                                        }`}
                                    >
                                        <ListFilter className="w-[17px] h-[17px]" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setNewProjectModalOpen(true)}
                                        className="p-1 rounded text-[#9e9e9e] hover:text-[#e3e3e3] hover:bg-white/5 transition-colors"
                                    >
                                        <FolderPlus className="w-[17px] h-[17px]" />
                                    </button>
                                </div>
                            </div>

                            {projectsSectionOpen && (
                                <div className="mt-1 space-y-4">
                                    {isLoadingOverview && projects.length === 0 ? (
                                        <div className="py-12 flex flex-col items-center justify-center gap-2 text-[#8e8e8e]">
                                            <Loader2 className="w-6 h-6 animate-spin text-[#8ab4f8]" />
                                            <span className="text-[13.5px]">Đang đồng bộ dự án từ {hostName}...</span>
                                        </div>
                                    ) : (
                                        projects.map(proj => {
                                            const isCollapsed = !!collapsedProjects[proj.id];
                                            const isExpandedAll = !!expandedSeeAllProjects[proj.id];
                                            const filteredConvs = filterConvList(proj.conversations);
                                            const defaultLimit = proj.name === 'AG' || proj.id.startsWith('ag-pc-') ? 8 : 3;
                                            const visibleConvs = isExpandedAll
                                                ? filteredConvs
                                                : filteredConvs.slice(0, defaultLimit);

                                            return (
                                                <div key={`mob_proj_${proj.id}`} className="space-y-1">
                                                    <div
                                                        onClick={() =>
                                                            setCollapsedProjects(prev => ({
                                                                ...prev,
                                                                [proj.id]: !prev[proj.id]
                                                            }))
                                                        }
                                                        className="flex items-center justify-between py-2 px-1.5 -mx-1.5 rounded-lg hover:bg-white/[0.04] cursor-pointer transition-colors"
                                                    >
                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                            <Folder className="w-[18px] h-[18px] text-[#9e9e9e] shrink-0" />
                                                            <span className="text-[15.5px] text-[#b8b8b8] font-normal truncate">
                                                                {proj.name}
                                                            </span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={e => handleStartNewInProject(proj, e)}
                                                            className="p-1 text-[#9e9e9e] hover:text-white rounded-md hover:bg-white/10 transition-colors"
                                                        >
                                                            <Plus className="w-[18px] h-[18px]" />
                                                        </button>
                                                    </div>

                                                    {!isCollapsed && (
                                                        <div className="pl-4 space-y-0.5">
                                                            {visibleConvs.map(conv => (
                                                                <div
                                                                    key={`mob_conv_${conv.id}`}
                                                                    onClick={() => handleOpenConversation(conv)}
                                                                    className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-lg hover:bg-white/[0.04] active:bg-white/[0.08] cursor-pointer transition-colors gap-3"
                                                                >
                                                                    <span
                                                                        className={`text-[15.5px] font-normal truncate ${
                                                                            proj.id === 'default-cli-project'
                                                                                ? 'text-[#9e9e9e]'
                                                                                : 'text-[#e3e3e3]'
                                                                        }`}
                                                                    >
                                                                        {maskEmailsInText(
                                                                            conv.workspaceTag
                                                                                ? `Claude giao · ${conv.workspaceTag} · ${conv.title}`
                                                                                : conv.title
                                                                        )}
                                                                    </span>

                                                                    <div className="shrink-0 flex items-center justify-end min-w-[28px]">
                                                                        {conv.isRunning ? (
                                                                            <PcRunningArcSpinner className="w-[15px] h-[15px] text-[#ec407a]" />
                                                                        ) : conv.unread ? (
                                                                            <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                                                                                <span className="absolute inline-flex h-3.5 w-3.5 rounded-full bg-[#e91e63]/30" />
                                                                                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ec407a]" />
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-[13px] text-[#8e8e8e]">
                                                                                {conv.relativeTime}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}

                                                            {proj.totalCount > defaultLimit && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setExpandedSeeAllProjects(prev => ({
                                                                            ...prev,
                                                                            [proj.id]: !prev[proj.id]
                                                                        }))
                                                                    }
                                                                    className="py-2 text-[14.5px] text-[#8e8e8e] hover:text-[#e3e3e3] transition-colors block text-left"
                                                                >
                                                                    {isExpandedAll
                                                                        ? 'Show less'
                                                                        : `See all (${proj.totalCount})`}
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </section>
                    </div>
                ) : (
                    /* MOBILE ACTIVE CONVERSATION VIEW */
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        <div className="px-3.5 py-2.5 bg-[#1e1e1e] border-b border-[#2c2c2c] flex items-center justify-between gap-2 shrink-0">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <button
                                    type="button"
                                    onClick={() => {
                                        navigateToConversation(null, true);
                                        fetchOverview(true);
                                    }}
                                    className="p-1.5 -ml-1 rounded-lg text-[#b0b0b0] hover:text-white hover:bg-white/5 transition-colors shrink-0"
                                >
                                    <ArrowLeft className="w-5 h-5" />
                                </button>

                                <div className="min-w-0">
                                    <div className="text-[14.5px] font-medium text-[#e3e3e3] truncate">
                                        {maskEmailsInText(activeConversation?.title || 'Đang tải hội thoại...')}
                                    </div>
                                    <div className="flex items-center gap-2 text-[12px] text-[#8e8e8e]">
                                        <span className="flex items-center gap-1">
                                            <Folder className="w-3 h-3" />
                                            {activeConversation?.projectName || targetNewProjectName}
                                        </span>
                                        <span>·</span>
                                        {activeConversation?.isRunning || isSubmitting ? (
                                            <span className="flex items-center gap-1.5 text-[#ec407a] font-medium">
                                                <PcRunningArcSpinner className="w-3 h-3 text-[#ec407a]" />
                                                Running
                                            </span>
                                        ) : (
                                            <span>{activeConversation?.stepCount || 0} steps</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                                {activeConversation && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            handleTogglePin(activeConversation.id, activeConversation.pinned)
                                        }
                                        className={`p-2 rounded-lg transition-colors ${
                                            activeConversation.pinned
                                                ? 'text-[#8ab4f8] bg-[#8ab4f8]/10'
                                                : 'text-[#8e8e8e] hover:text-white hover:bg-white/5'
                                        }`}
                                    >
                                        <Pin className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-36 space-y-5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                            {isLoadingConversation && !activeConversation ? (
                                <div className="py-16 flex flex-col items-center justify-center gap-2.5 text-[#8e8e8e]">
                                    <Loader2 className="w-6 h-6 animate-spin text-[#8ab4f8]" />
                                    <span className="text-[13.5px]">Đang tải nội dung phiên làm việc...</span>
                                </div>
                            ) : activeConversation?.messages && activeConversation.messages.length > 0 ? (
                                activeConversation.messages.map(msg => {
                                    if (msg.role === 'user') {
                                        return (
                                            <div key={`mob_m_${msg.id}`} className="flex justify-end">
                                                <div className="max-w-[88%] rounded-2xl bg-[#2b2b2b] border border-[#3a3a3a] px-4 py-3 text-[15px] text-[#e3e3e3] leading-relaxed whitespace-pre-wrap break-words">
                                                    {renderMessageMedia(msg, false)}
                                                    {msg.content ? maskEmailsInText(msg.content) : null}
                                                </div>
                                            </div>
                                        );
                                    }

                                    const isThinkOpen = !!expandedThinking[msg.id];
                                    return (
                                        <div key={`mob_m_${msg.id}`} className="space-y-2.5">
                                            {msg.thinking && (
                                                <div className="rounded-xl bg-[#202020] border border-[#2e2e2e] overflow-hidden">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setExpandedThinking(prev => ({
                                                                ...prev,
                                                                [msg.id]: !prev[msg.id]
                                                            }))
                                                        }
                                                        className="w-full px-3.5 py-2 flex items-center justify-between text-[13px] text-[#9e9e9e] hover:text-[#e3e3e3] transition-colors"
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <Sparkles className="w-3.5 h-3.5 text-[#8ab4f8]" />
                                                            <span>
                                                                Thought
                                                                {msg.thinkingSeconds
                                                                    ? ` for ${msg.thinkingSeconds}s`
                                                                    : ''}
                                                            </span>
                                                        </span>
                                                        {isThinkOpen ? (
                                                            <ChevronUp className="w-4 h-4" />
                                                        ) : (
                                                            <ChevronRight className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                    {isThinkOpen && (
                                                        <div className="px-3.5 pb-3 pt-1 text-[13px] text-[#9e9e9e] border-t border-[#2a2a2a] whitespace-pre-wrap leading-relaxed font-mono">
                                                            {maskEmailsInText(msg.thinking)}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {msg.toolCalls && msg.toolCalls.length > 0 && (
                                                <div className="space-y-1.5">
                                                    {msg.toolCalls.map((tc, tIdx) => {
                                                        const toolKey = `${msg.id}_tool_${tIdx}`;
                                                        const isToolOpen = !!expandedTools[toolKey];
                                                        const isCmd =
                                                            tc.name.includes('command') || tc.name.includes('terminal');

                                                        return (
                                                            <div
                                                                key={toolKey}
                                                                className="rounded-xl bg-[#212121] border border-[#303030] overflow-hidden"
                                                            >
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setExpandedTools(prev => ({
                                                                            ...prev,
                                                                            [toolKey]: !prev[toolKey]
                                                                        }))
                                                                    }
                                                                    className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left text-[12.5px] text-[#b0b0b0] hover:bg-white/[0.03]"
                                                                >
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        {isCmd ? (
                                                                            <Terminal className="w-3.5 h-3.5 text-[#8ab4f8] shrink-0" />
                                                                        ) : (
                                                                            <FileCode className="w-3.5 h-3.5 text-[#81c995] shrink-0" />
                                                                        )}
                                                                        <span className="truncate font-mono">
                                                                            {tc.summary ||
                                                                                tc.path ||
                                                                                tc.command ||
                                                                                tc.name}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                                        {tc.status === 'running' ? (
                                                                            <PcRunningArcSpinner className="w-3.5 h-3.5 text-[#8ab4f8]" />
                                                                        ) : (
                                                                            <CheckCircle2 className="w-3.5 h-3.5 text-[#57ab5a]" />
                                                                        )}
                                                                        <ChevronDown
                                                                            className={`w-3.5 h-3.5 text-[#787878] transition-transform ${
                                                                                isToolOpen ? 'rotate-180' : ''
                                                                            }`}
                                                                        />
                                                                    </div>
                                                                </button>

                                                                {isToolOpen && (tc.command || tc.path || tc.output) && (
                                                                    <div className="px-3 py-2 bg-[#161616] border-t border-[#2c2c2c] text-[12px] font-mono text-[#9e9e9e] space-y-1.5 overflow-x-auto">
                                                                        {tc.command && (
                                                                            <div className="text-[#8ab4f8]">
                                                                                $ {tc.command}
                                                                            </div>
                                                                        )}
                                                                        {tc.path && (
                                                                            <div className="text-[#81c995]">
                                                                                File: {tc.path}
                                                                            </div>
                                                                        )}
                                                                        {tc.output && (
                                                                            <pre className="text-[#b0b0b0] whitespace-pre-wrap max-h-52 overflow-y-auto">
                                                                                {maskEmailsInText(tc.output)}
                                                                            </pre>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {renderMessageMedia(msg, false)}
                                            {msg.content && (
                                                <div className="pl-0.5">
                                                    {renderFormattedContent(msg.content, msg.id, false)}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="py-12 text-center text-[14px] text-[#8e8e8e]">
                                    Chưa có bước hiển thị trong phiên này. Hãy gửi yêu cầu bên dưới để tiếp tục.
                                </div>
                            )}
                            <div ref={mobileMessagesEndRef} />
                        </div>
                    </div>
                )}

                {/* 3. MOBILE BOTTOM FLOATING PROMPT BOX */}
                <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 pt-6 bg-gradient-to-t from-[#191919] via-[#191919]/95 to-transparent z-20">
                    {modelMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-30" onClick={() => setModelMenuOpen(false)} />
                            <div className="relative mb-2 rounded-2xl bg-[#252525] border border-[#3a3a3a] shadow-2xl py-2 z-40 max-h-72 overflow-y-auto">
                                <div className="px-4 py-1 text-[11.5px] font-medium text-[#8e8e8e] flex items-center justify-between">
                                    <span>Model Selection</span>
                                    <span>Quota</span>
                                </div>
                                {models.map(m => {
                                    const isSelected = selectedModel.id === m.id;
                                    const pct = Math.round((m.remainingFraction ?? 0.99) * 100);
                                    return (
                                        <button
                                            key={`mob_mod_${m.id}`}
                                            type="button"
                                            onClick={() => {
                                                setSelectedModel(m);
                                                setModelMenuOpen(false);
                                            }}
                                            className={`w-full px-4 py-2.5 flex items-center justify-between hover:bg-white/5 text-left transition-colors ${
                                                isSelected ? 'bg-white/[0.06]' : ''
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-[14px] text-[#e3e3e3] font-normal truncate">
                                                    {m.name}
                                                </span>
                                                {m.tier && (
                                                    <span className="text-[13.5px] text-[#8e8e8e] font-normal">
                                                        {m.tier}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-[12px] text-[#8e8e8e]">{pct}%</span>
                                                {isSelected && <Check className="w-4 h-4 text-[#8ab4f8]" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    <div
                        onDragOver={e => {
                            e.preventDefault();
                            setIsDraggingMedia(true);
                        }}
                        onDragLeave={() => setIsDraggingMedia(false)}
                        onDrop={handleDropMedia}
                        className="bg-[#242424] border border-[#383838] rounded-[22px] px-4 pt-3.5 pb-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.65)]"
                    >
                        {renderComposerAttachments(true)}
                        <textarea
                            ref={mobileTextareaRef}
                            rows={1}
                            value={promptText}
                            onChange={handlePromptChange}
                            onPaste={handlePasteMedia}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmitPrompt();
                                }
                            }}
                            placeholder="Ask anything, @ to mention, / for actions"
                            className="w-full bg-transparent text-[#e3e3e3] placeholder-[#787878] text-[15.5px] leading-relaxed outline-none resize-none max-h-32"
                        />

                        <div className="mt-2.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-1 text-[#9e9e9e] hover:text-[#e3e3e3] transition-colors shrink-0"
                                >
                                    <Plus className="w-[19px] h-[19px]" />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setModelMenuOpen(prev => !prev)}
                                    className="flex items-center gap-1.5 py-1 px-1.5 rounded-lg hover:bg-white/5 transition-colors truncate"
                                >
                                    <span className="text-[14px] text-[#b8b8b8] font-normal truncate">
                                        {selectedModel.name}
                                    </span>
                                    {selectedModel.tier && (
                                        <span className="text-[14px] text-[#787878] font-normal shrink-0">
                                            {selectedModel.tier}
                                        </span>
                                    )}
                                    <ChevronUp className="w-3.5 h-3.5 text-[#787878] shrink-0 ml-0.5" />
                                </button>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                                <button
                                    type="button"
                                    onClick={handleVoiceInput}
                                    className={`p-1.5 rounded-full transition-colors ${
                                        isListeningVoice
                                            ? 'text-[#ec407a] bg-[#ec407a]/15 animate-pulse'
                                            : 'text-[#9e9e9e] hover:text-[#e3e3e3]'
                                    }`}
                                >
                                    <Mic className="w-[18px] h-[18px]" />
                                </button>

                                {isSubmitting ? (
                                    <button
                                        type="button"
                                        onClick={handleCancelRunning}
                                        className="w-9 h-9 rounded-full bg-[#383838] hover:bg-[#4a4a4a] text-[#f28b82] flex items-center justify-center transition-all"
                                    >
                                        <Square className="w-3.5 h-3.5 fill-current" />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleSubmitPrompt}
                                        disabled={!promptText.trim() && attachedMedia.length === 0}
                                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                                            promptText.trim() || attachedMedia.length > 0
                                                ? 'bg-[#e3e3e3] text-[#191919] shadow-md scale-100'
                                                : 'bg-[#363636] text-[#8e8e8e]'
                                        }`}
                                    >
                                        <ArrowRight className="w-[18px] h-[18px]" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* =========================================================================================
                C. SHARED MODALS (History, Automations, Customizations, Select Project, Settings)
               ========================================================================================= */}
            {historyModalOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    onClick={() => setHistoryModalOpen(false)}
                >
                    <div
                        className="w-full max-w-lg rounded-2xl bg-white text-[#1f1f1f] border border-[#dfdfd8] p-4 space-y-3 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-[#ececea] pb-2.5">
                            <div className="flex items-center gap-2">
                                <History className="w-4 h-4 text-[#5f6368]" />
                                <h3 className="text-[14.5px] font-medium">Conversation History</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setHistoryModalOpen(false)}
                                className="text-[#787878] hover:text-[#1f1f1f]"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="max-h-96 overflow-y-auto space-y-1 pr-1">
                            {projects.flatMap(p => p.conversations).map(conv => (
                                <button
                                    key={`hist_${conv.id}`}
                                    type="button"
                                    onClick={() => handleOpenConversation(conv)}
                                    className="w-full px-3 py-2 rounded-lg hover:bg-black/[0.04] flex items-center justify-between text-left gap-3"
                                >
                                    <div className="min-w-0">
                                        <div className="text-[13.5px] font-medium text-[#1f1f1f] truncate">
                                            {conv.title}
                                        </div>
                                        <div className="text-[11.5px] text-[#787878] flex items-center gap-1.5">
                                            <Folder className="w-3 h-3" />
                                            <span>{conv.projectName}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {conv.isRunning && (
                                            <PcRunningArcSpinner className="w-3.5 h-3.5 text-[#1967d2]" />
                                        )}
                                        <span className="text-[12px] text-[#787878]">{conv.relativeTime}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {automationsModalOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    onClick={() => setAutomationsModalOpen(false)}
                >
                    <div
                        className="w-full max-w-md rounded-2xl bg-white text-[#1f1f1f] border border-[#dfdfd8] p-4 space-y-3 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-[#ececea] pb-2.5">
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-[#5f6368]" />
                                <h3 className="text-[14.5px] font-medium">Automations ({hostName})</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setAutomationsModalOpen(false)}
                                className="text-[#787878] hover:text-[#1f1f1f]"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="space-y-2 text-[13px]">
                            <div className="p-3 rounded-xl bg-[#f7f7f5] border border-[#e6e6e4] flex items-center justify-between">
                                <div>
                                    <div className="font-medium text-[#1f1f1f]">AG Companion WebSocket Bridge</div>
                                    <div className="text-[12px] text-[#6e6e6e]">
                                        Real-time trajectory & status streaming (0.7s interval)
                                    </div>
                                </div>
                                <span className="px-2 py-0.5 rounded-full bg-[#e6f4ea] text-[#137333] text-[11px] font-medium">
                                    Active
                                </span>
                            </div>
                            <div className="p-3 rounded-xl bg-[#f7f7f5] border border-[#e6e6e4] flex items-center justify-between">
                                <div>
                                    <div className="font-medium text-[#1f1f1f]">AIHOT LAN Web Guard</div>
                                    <div className="text-[12px] text-[#6e6e6e]">
                                        Cross-LAN bridge & service health monitor
                                    </div>
                                </div>
                                <span className="px-2 py-0.5 rounded-full bg-[#e6f4ea] text-[#137333] text-[11px] font-medium">
                                    Active
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {customizationsModalOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    onClick={() => setCustomizationsModalOpen(false)}
                >
                    <div
                        className="w-full max-w-md rounded-2xl bg-white text-[#1f1f1f] border border-[#dfdfd8] p-4 space-y-3 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-[#ececea] pb-2.5">
                            <div className="flex items-center gap-2">
                                <Archive className="w-4 h-4 text-[#5f6368]" />
                                <h3 className="text-[14.5px] font-medium">Customizations ({hostName})</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setCustomizationsModalOpen(false)}
                                className="text-[#787878] hover:text-[#1f1f1f]"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="space-y-2 text-[13px]">
                            <div className="p-3 rounded-xl bg-[#f7f7f5] border border-[#e6e6e4]">
                                <div className="font-medium text-[#1f1f1f]">Workspace Rules</div>
                                <div className="text-[12px] text-[#6e6e6e] mt-0.5">
                                    ~/.gemini/GEMINI.md · Documents/AG/AGENTS.md (Active)
                                </div>
                            </div>
                            <div className="p-3 rounded-xl bg-[#f7f7f5] border border-[#e6e6e4]">
                                <div className="font-medium text-[#1f1f1f]">Skills & Workflows</div>
                                <div className="text-[12px] text-[#6e6e6e] mt-0.5">
                                    19 workspace skills loaded (colab-operator, design, slides, weixin, douyin...)
                                </div>
                            </div>
                            <div className="p-3 rounded-xl bg-[#f7f7f5] border border-[#e6e6e4]">
                                <div className="font-medium text-[#1f1f1f]">MCP Servers</div>
                                <div className="text-[12px] text-[#6e6e6e] mt-0.5">
                                    botcake · fanpage_ai_hub · gdrive · blender (Connected)
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {newProjectModalOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
                    onClick={() => setNewProjectModalOpen(false)}
                >
                    <div
                        className="w-full max-w-sm rounded-2xl bg-[#242424] text-white border border-[#383838] p-4 space-y-3 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-[15px] font-medium">Select Project</h3>
                            <button
                                type="button"
                                onClick={() => setNewProjectModalOpen(false)}
                                className="text-[#8e8e8e] hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="space-y-1 max-h-64 overflow-y-auto">
                            {projects.map(p => (
                                <button
                                    key={`modal_proj_${p.id}`}
                                    type="button"
                                    onClick={() => {
                                        setTargetNewProjectId(p.id);
                                        setTargetNewProjectName(p.name);
                                        setNewProjectModalOpen(false);
                                        navigateToConversation(null, true);
                                        setTimeout(() => {
                                            desktopTextareaRef.current?.focus();
                                            mobileTextareaRef.current?.focus();
                                        }, 80);
                                    }}
                                    className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between text-left transition-colors ${
                                        targetNewProjectId === p.id
                                            ? 'bg-white/10 text-white'
                                            : 'hover:bg-white/5 text-[#e3e3e3]'
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5 truncate">
                                        <Folder className="w-4 h-4 text-[#9e9e9e] shrink-0" />
                                        <span className="text-[14px] truncate">{p.name}</span>
                                    </div>
                                    <span className="text-[12px] text-[#8e8e8e]">{p.totalCount}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {settingsModalOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
                    onClick={() => setSettingsModalOpen(false)}
                >
                    <div
                        className="w-full max-w-sm rounded-2xl bg-[#242424] text-white border border-[#383838] p-4 space-y-4 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <AntigravityRibbonLogo className="w-5 h-5" />
                                <h3 className="text-[15px] font-medium text-white">Antigravity Settings</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSettingsModalOpen(false)}
                                className="text-[#8e8e8e] hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-2.5 text-[13.5px]">
                            <div className="p-3 rounded-xl bg-[#1c1c1c] border border-[#303030] space-y-1">
                                <div className="text-[#8e8e8e] text-[12px]">Connected Machine</div>
                                <div className="flex items-center gap-2 text-white font-medium">
                                    <span className="w-2 h-2 rounded-full bg-[#57ab5a]" />
                                    {hostName} (WebSocket Realtime Active)
                                </div>
                            </div>

                            <div className="p-3 rounded-xl bg-[#1c1c1c] border border-[#303030] space-y-1">
                                <div className="text-[#8e8e8e] text-[12px]">Account</div>
                                <div className="text-white font-medium">
                                    {member.display_name || member.username} ({member.role || 'member'})
                                </div>
                            </div>

                            <div className="p-3 rounded-xl bg-[#1c1c1c] border border-[#303030] space-y-1">
                                <div className="text-[#8e8e8e] text-[12px]">Execution Mode</div>
                                <div className="text-[#81c995] font-medium">
                                    {execMode} · {envMode} Workspace
                                </div>
                            </div>
                        </div>

                        {onBackToPortal && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSettingsModalOpen(false);
                                    onBackToPortal();
                                }}
                                className="w-full py-2.5 rounded-xl bg-[#333333] hover:bg-[#404040] text-white text-[14px] font-medium transition-colors"
                            >
                                ← Quay về các mục Cổng Thành Viên
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
