import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { calibrateSrgbLutStage } from "../../utils/srgbLutProfile";
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
    Music,
    ArrowDown,
    MoreVertical,
    Gauge,
    Info
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
    onOpenMobileMenu?: () => void;
    initialProvider?: 'antigravity' | 'chatgpt';
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
    provider?: 'antigravity' | 'chatgpt';
    sourceKind?: string;
    model?: string;
    reasoningEffort?: string;
    hasError?: boolean;
    errorMessage?: string;
}

export interface CompanionProjectGroup {
    id: string;
    name: string;
    folderPath?: string;
    sourceKind?: string;
    totalCount: number;
    conversations: CompanionConversationItem[];
}

export interface ChatGPTOverviewData {
    appName?: string;
    hostName?: string;
    mode?: string;
    activeModel?: string;
    activeEffort?: string;
    permissionLabel?: string;
    defaultProjectId: string;
    defaultProjectName: string;
    host?: {
        id?: string;
        name?: string;
        online?: boolean;
        defaultProjectId?: string;
        defaultProjectName?: string;
        defaultModel?: string;
        defaultModelLabel?: string;
        permissionLabel?: string;
    };
    quotaAlert?: {
        active: boolean;
        title: string;
        subtitle: string;
        resetTimeLabel?: string;
    } | null;
    quota?: {
        source?: 'live' | 'stale' | 'unavailable';
        fetchedAt?: number;
        planType?: string;
        allowed?: boolean | null;
        limitReached?: boolean;
        resetTimeHm?: string;
        fiveHour?: {
            usedPercent: number;
            remainingPercent: number;
            resetAfterSeconds?: number;
            resetLabel: string;
        } | null;
        weekly?: {
            usedPercent: number;
            remainingPercent: number;
            resetAfterSeconds?: number;
            resetLabel: string;
        } | null;
    };
    models: CompanionModel[];
    pinnedConversations: CompanionConversationItem[];
    projects: CompanionProjectGroup[];
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
    taskFinished?: {
        taskId: string;
        summary: string;
        status: string;
        output: string;
    };
    completed?: boolean;
    timestamp: number;
    images?: string[];
    media?: MediaAttachment[];
}

export interface ConversationDetail {
    id: string;
    schemaV?: number;
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

const DEFAULT_CHATGPT_MODELS: CompanionModel[] = [
    {
        id: 'gpt-6.1-sol:ultra',
        label: 'GPT-6.1 Sol Ultra',
        name: 'GPT-6.1 Sol',
        tier: 'Ultra',
        tag: 'Codex',
        cliModel: 'gpt-6.1-sol',
        proxyModel: 'gemini-2.5-flash',
        remainingFraction: 1.0
    },
    {
        id: 'gpt-6.1-sol:max',
        label: 'GPT-6.1 Sol Max',
        name: 'GPT-6.1 Sol',
        tier: 'Max',
        tag: 'Codex',
        cliModel: 'gpt-6.1-sol',
        proxyModel: 'gemini-2.5-flash',
        remainingFraction: 1.0
    },
    {
        id: 'gpt-6.1-sol:xhigh',
        label: 'GPT-6.1 Sol Extra High',
        name: 'GPT-6.1 Sol',
        tier: 'Extra High',
        tag: 'Codex',
        cliModel: 'gpt-6.1-sol',
        proxyModel: 'gemini-2.5-flash',
        remainingFraction: 1.0
    },
    {
        id: 'gpt-6.1-sol:high',
        label: 'GPT-6.1 Sol High',
        name: 'GPT-6.1 Sol',
        tier: 'High',
        tag: 'Codex',
        cliModel: 'gpt-6.1-sol',
        proxyModel: 'gemini-2.5-flash',
        remainingFraction: 1.0
    },
    {
        id: 'gpt-6-astra:xhigh',
        label: 'GPT-6 Astra Extra High',
        name: 'GPT-6 Astra',
        tier: 'Extra High',
        tag: 'Codex',
        cliModel: 'gpt-6-astra',
        proxyModel: 'gemini-2.5-flash',
        remainingFraction: 1.0
    },
    {
        id: 'gpt-6.1-terra:xhigh',
        label: 'GPT-6.1 Terra Extra High',
        name: 'GPT-6.1 Terra',
        tier: 'Extra High',
        tag: 'Codex',
        cliModel: 'gpt-6.1-terra',
        proxyModel: 'gemini-2.5-flash',
        remainingFraction: 1.0
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
const AntigravityRibbonLogo: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => {
    const gradId = React.useId().replace(/:/g, '_');
    return (
        <svg viewBox="0 0 36 36" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id={gradId} x1="4" y1="30" x2="32" y2="6" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#4285F4" />
                    <stop offset="35%" stopColor="#EA4335" />
                    <stop offset="70%" stopColor="#FBBC05" />
                    <stop offset="100%" stopColor="#34A853" />
                </linearGradient>
            </defs>
            <path
                d="M7 29.5C9.5 21 13.8 7.5 18 7.5C22.2 7.5 26.5 21 29 29.5"
                stroke={`url(#${gradId})`}
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
};

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

// OpenAI / ChatGPT blossom knot logo SVG
const ChatGPTLogo: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
);

// Red Circle Exclamation Icon matching ChatGPT PC error indicator (!)
const AlertCircleRedIcon: React.FC<{ className?: string; title?: string }> = ({ className = 'w-3.5 h-3.5', title }) => (
    <svg viewBox="0 0 16 16" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
        {title ? <title>{title}</title> : null}
        <circle cx="8" cy="8" r="6.3" stroke="#e53935" strokeWidth="1.35" />
        <path d="M8 4.8V8.4" stroke="#e53935" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="8" cy="10.9" r="0.85" fill="#e53935" />
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
    onBackToPortal,
    onOpenMobileMenu,
    initialProvider
}) => {
    // Strictly distinguish Host System Owner (Admin) vs regular Member accounts
    const isSystemOwner =
        member.role === 'admin' ||
        member.id === 'system_owner' ||
        ['vudanhdu999', 'admin'].includes((member.username || '').toLowerCase());
    const safeAuthToken = (() => {
        const raw = member.token || '';
        if (raw && !raw.includes('•') && /^[\x20-\x7E]+$/.test(raw)) return raw;
        if (typeof window !== 'undefined') {
            try {
                const stored =
                    localStorage.getItem('abv_admin_api_key') ||
                    sessionStorage.getItem('abv_admin_api_key') ||
                    '';
                if (stored && /^[\x20-\x7E]+$/.test(stored)) return stored;
            } catch {}
        }
        return raw.replace(/[^\x20-\x7E]/g, '') || 'admin_session';
    })();
    const effectiveMemberId = isSystemOwner ? 'system_owner' : member.id;
    const safeMemberFolder = encodeURIComponent(member.id);
    const defaultHostName = isSystemOwner
        ? 'vudanhdu-cosmic-spark'
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

    // Companion HTTP URLs (works directly on HTTPS https://aihot.vn via /api/ag-companion/* AND HTTP LAN :8046)
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

    // Companion WebSocket URLs (works directly on wss://aihot.vn/api/ag-companion/ws AND ws://<host>:8046/ws)
    const getCompanionWsUrls = useCallback((): string[] => {
        const urls: string[] = [];
        if (typeof window !== 'undefined' && safeAuthToken) {
            const q = `?memberId=${encodeURIComponent(effectiveMemberId)}&key=${encodeURIComponent(safeAuthToken)}`;
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
    }, [effectiveMemberId, safeAuthToken]);

    // Provider State: 'antigravity' vs 'chatgpt' (synced from ChatGPT PC .codex)
    calibrateSrgbLutStage("hub:remote_agent");
    const [activeProvider, setActiveProvider] = useState<'antigravity' | 'chatgpt'>(() => {
        if (initialProvider) return initialProvider;
        if (typeof window !== 'undefined') {
            if ((window as any).__agRemoteActiveProvider === 'chatgpt') return 'chatgpt';
            if ((window as any).__agRemoteActiveProvider === 'antigravity') return 'antigravity';
            try {
                const sp = new URLSearchParams(window.location.search);
                if (sp.get('provider') === 'chatgpt') return 'chatgpt';
            } catch {}
        }
        return 'antigravity';
    });
    const isChatGPT = activeProvider === 'chatgpt';
    const [chatgptSubTab, setChatgptSubTab] = useState<'work' | 'chat'>('work');
    const [chatgptPermMode, setChatgptPermMode] = useState<string>('Toàn quyền tiếp cận');
    const [chatgptModels, setChatgptModels] = useState<CompanionModel[]>(DEFAULT_CHATGPT_MODELS);
    const [chatgptSelectedModel, setChatgptSelectedModel] = useState<CompanionModel>(DEFAULT_CHATGPT_MODELS[0]);
    const [chatgptPinnedConversations, setChatgptPinnedConversations] = useState<CompanionConversationItem[]>([]);
    const [chatgptProjects, setChatgptProjects] = useState<CompanionProjectGroup[]>([]);
    const [chatgptQuotaAlert, setChatgptQuotaAlert] = useState<ChatGPTOverviewData['quotaAlert']>(null);
    const [chatgptQuota, setChatgptQuota] = useState<ChatGPTOverviewData['quota']>(undefined);
    const [chatgptTargetProjectId, setChatgptTargetProjectId] = useState<string>('01a0b8c2-f8cd-7b81-bf3a-290e3eedee39');
    const [chatgptTargetProjectName, setChatgptTargetProjectName] = useState<string>('BUSINESS');

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

    // Collapsible sections & expansion state (LUYỆN CỜ CODEX collapsed by default matching ChatGPT PC screenshot)
    const [pinnedSectionOpen, setPinnedSectionOpen] = useState<boolean>(true);
    const [projectsSectionOpen, setProjectsSectionOpen] = useState<boolean>(true);
    const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({
        'c9068346-1197-4191-a2fd-08727262598d': true
    });
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

    // Effective active lists & selections depending on activeProvider ('antigravity' vs 'chatgpt')
    const CHATGPT_CLOUD_IDS = useMemo(() => new Set(['chatgpt-cloud-chat', 'chatgpt-cloud-sessions']), []);
    const effectiveModels = isChatGPT ? chatgptModels : models;
    const effectiveSelectedModel = isChatGPT ? chatgptSelectedModel : selectedModel;
    const effectivePinnedConversations = useMemo(() => {
        if (!isChatGPT) return pinnedConversations;
        if (chatgptSubTab === 'chat') {
            return chatgptPinnedConversations.filter(
                c => c.sourceKind === 'chat' || CHATGPT_CLOUD_IDS.has(c.projectId)
            );
        }
        return chatgptPinnedConversations.filter(
            c => c.sourceKind !== 'chat' && !CHATGPT_CLOUD_IDS.has(c.projectId)
        );
    }, [isChatGPT, pinnedConversations, chatgptPinnedConversations, chatgptSubTab, CHATGPT_CLOUD_IDS]);
    const effectiveProjects = useMemo(() => {
        if (!isChatGPT) return projects;
        if (chatgptSubTab === 'chat') {
            return chatgptProjects.filter(
                p =>
                    CHATGPT_CLOUD_IDS.has(p.id) ||
                    p.sourceKind === 'chat' ||
                    p.conversations.some(c => c.sourceKind === 'chat')
            );
        }
        return chatgptProjects.filter(
            p => !CHATGPT_CLOUD_IDS.has(p.id) && p.sourceKind !== 'chat'
        );
    }, [isChatGPT, projects, chatgptProjects, chatgptSubTab, CHATGPT_CLOUD_IDS]);
    const effectiveTargetProjectId = isChatGPT ? chatgptTargetProjectId : targetNewProjectId;
    const effectiveTargetProjectName = isChatGPT ? chatgptTargetProjectName : targetNewProjectName;

    const providerConvMemoryRef = useRef<{
        antigravity: { id: string | null; conv: ConversationDetail | null; nav: Array<string | null>; navIdx: number };
        chatgpt: { id: string | null; conv: ConversationDetail | null; nav: Array<string | null>; navIdx: number };
    }>({
        antigravity: { id: null, conv: null, nav: [null], navIdx: 0 },
        chatgpt: { id: null, conv: null, nav: [null], navIdx: 0 }
    });

    // Viewport & Windowed Message Rendering State (prevents double Desktop+Mobile DOM & keystroke lag)
    const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
        typeof window !== 'undefined' ? window.innerWidth < 768 : false
    );
    const [visibleGroupLimit, setVisibleGroupLimit] = useState<number>(40);
    const [isMobileComposerFocused, setIsMobileComposerFocused] = useState<boolean>(false);
    const [isMobileComposerExpanded, setIsMobileComposerExpanded] = useState<boolean>(false);
    const [showMobileScrollDownBtn, setShowMobileScrollDownBtn] = useState<boolean>(false);
    const [vvState, setVvState] = useState<{ height: number; offsetTop: number; keyboardOpen: boolean }>(() => ({
        height: typeof window !== 'undefined' ? Math.round(window.visualViewport?.height || window.innerHeight) : 0,
        offsetTop: 0,
        keyboardOpen: false
    }));
    const mobileBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(max-width: 767px)');
        const updateViewport = () => setIsMobileViewport(mq.matches);
        updateViewport();
        if (mq.addEventListener) {
            mq.addEventListener('change', updateViewport);
            return () => mq.removeEventListener('change', updateViewport);
        } else {
            window.addEventListener('resize', updateViewport);
            return () => window.removeEventListener('resize', updateViewport);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined' || !isMobileViewport) return;
        const vv = window.visualViewport;
        let baselineHeight = Math.max(window.innerHeight, vv?.height || 0);

        const updateVisualViewport = () => {
            const rawVvH = vv && vv.height > 0 ? vv.height : window.innerHeight;
            const curH = window.innerHeight > 0 ? Math.min(rawVvH, window.innerHeight) : rawVvH;
            const curTop = vv ? Math.max(0, vv.offsetTop) : 0;
            if (curH > baselineHeight) {
                baselineHeight = curH;
            }
            const kbOpen = baselineHeight - curH > 110;
            setVvState(prev => {
                const nextH = Math.round(curH);
                const nextTop = Math.round(curTop);
                if (
                    Math.abs(prev.height - nextH) <= 1 &&
                    Math.abs(prev.offsetTop - nextTop) <= 1 &&
                    prev.keyboardOpen === kbOpen
                ) {
                    return prev;
                }
                return {
                    height: nextH,
                    offsetTop: nextTop,
                    keyboardOpen: kbOpen
                };
            });
        };

        updateVisualViewport();
        vv?.addEventListener('resize', updateVisualViewport);
        vv?.addEventListener('scroll', updateVisualViewport);
        window.addEventListener('resize', updateVisualViewport);
        return () => {
            vv?.removeEventListener('resize', updateVisualViewport);
            vv?.removeEventListener('scroll', updateVisualViewport);
            window.removeEventListener('resize', updateVisualViewport);
            if (mobileBlurTimerRef.current) {
                clearTimeout(mobileBlurTimerRef.current);
            }
        };
    }, [isMobileViewport]);

    // Composer State
    const [promptText, setPromptText] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
    const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
    const [expandedWorkGroups, setExpandedWorkGroups] = useState<Record<string, boolean>>({});
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
    const [customData, setCustomData] = useState<{
        rules?: Array<{ name: string; path: string; sizeBytes?: number }>;
        skills?: Array<{ name: string; path: string }>;
        mcpServers?: Array<{ name: string; toolsCount?: number }>;
    } | null>(null);

    const desktopTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const mobileTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const desktopMessagesEndRef = useRef<HTMLDivElement | null>(null);
    const mobileMessagesEndRef = useRef<HTMLDivElement | null>(null);
    const desktopScrollContainerRef = useRef<HTMLDivElement | null>(null);
    const mobileScrollContainerRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const activePendingCmdIdRef = useRef<string | null>(null);
    const companionWsRef = useRef<WebSocket | null>(null);
    const activeCidRef = useRef<string | null>(null);
    activeCidRef.current = activeConversationId;

    const handleSwitchProvider = useCallback(
        (nextProvider: 'antigravity' | 'chatgpt') => {
            if (typeof window !== 'undefined') {
                (window as any).__agRemoteActiveProvider = nextProvider;
                try {
                    const url = new URL(window.location.href);
                    if (nextProvider === 'chatgpt') url.searchParams.set('provider', 'chatgpt');
                    else url.searchParams.delete('provider');
                    window.history.replaceState({}, '', url.toString());
                } catch {}
                window.dispatchEvent(new CustomEvent('ag-remote-provider-changed', { detail: nextProvider }));
            }
            if (nextProvider === activeProvider) return;
            providerConvMemoryRef.current[activeProvider] = {
                id: activeConversationId,
                conv: activeConversation,
                nav: navHistory,
                navIdx: navIndex
            };
            const restored = providerConvMemoryRef.current[nextProvider] || { id: null, conv: null, nav: [null], navIdx: 0 };
            activeCidRef.current = restored.id;
            setActiveProvider(nextProvider);
            setActiveConversationId(restored.id);
            setActiveConversation(restored.conv);
            setNavHistory(Array.isArray(restored.nav) && restored.nav.length > 0 ? restored.nav : [restored.id]);
            setNavIndex(typeof restored.navIdx === 'number' ? restored.navIdx : 0);
            setModelMenuOpen(false);
            setDesktopProjectMenuOpen(false);
            setExecMenuOpen(false);
            setEnvMenuOpen(false);
            setSlashMenuOpen(false);
            setMentionMenuOpen(false);
        },
        [activeProvider, activeConversationId, activeConversation, navHistory, navIndex]
    );

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const onExtSwitch = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail === 'chatgpt' || detail === 'antigravity') {
                handleSwitchProvider(detail);
            }
        };
        window.addEventListener('ag-remote-switch-provider', onExtSwitch);
        return () => window.removeEventListener('ag-remote-switch-provider', onExtSwitch);
    }, [handleSwitchProvider]);
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

    // Universal Companion Command Dispatcher (works on HTTP LAN :8046 AND HTTPS https://aihot.vn via same-origin relay)
    const dispatchCompanionCommand = useCallback(
        async (action: 'new' | 'send' | 'pin' | 'cancel' | 'save_conv', payload: Record<string, any>): Promise<any> => {
            const authToken = safeAuthToken;
            const createdAtMs = Date.now();
            const ttlMs = 60000;
            const expiresAtMs = createdAtMs + ttlMs;
            const cmdId = String(payload.cmdId || `cmd_${createdAtMs}_${Math.random().toString(36).slice(2, 8)}`);
            const scopedPayload = {
                ...payload,
                cmdId,
                action,
                memberId: effectiveMemberId,
                createdAtMs,
                ttlMs,
                expiresAtMs
            };
            const candidates = getCompanionBaseUrls();

            const checkCmdReceiptOnce = async (timeoutMs = 2500): Promise<any | null> => {
                const receiptUrls = [
                    ...candidates.map(b => `${b}/api/ag-companion/cmd/${encodeURIComponent(cmdId)}?t=${Date.now()}`),
                    `${originUrl}/ag-remote/cmd/${encodeURIComponent(cmdId)}.json?t=${Date.now()}`
                ];
                for (const rUrl of receiptUrls) {
                    try {
                        const rRes = await fetch(rUrl, {
                            headers: { Authorization: `Bearer ${authToken}` },
                            signal: AbortSignal.timeout(timeoutMs)
                        });
                        const ctype = (rRes.headers.get('content-type') || '').toLowerCase();
                        if (rRes.ok && ctype.includes('json')) {
                            const rData = await rRes.json();
                            if (rData && rData.cmdId === cmdId) {
                                if (rData.inProgress || rData.status === 'in_progress' || rData.status === 'claimed' || rData.status === 'pending') {
                                    alreadyClaimedOnBridge = true;
                                    return null;
                                }
                                if (rData.status !== 'not_found') {
                                    return rData;
                                }
                            }
                        }
                    } catch {
                        // Try next receipt URL
                    }
                }
                return null;
            };

            const sendBestEffortCancelCmd = () => {
                try {
                    const cancelNowMs = Date.now();
                    const cancelObj = {
                        cmdId: `cancel_${cmdId}`,
                        action: 'cancel_cmd',
                        targetCmdId: cmdId,
                        memberId: effectiveMemberId,
                        createdAtMs: cancelNowMs,
                        ttlMs: 30000,
                        expiresAtMs: cancelNowMs + 30000
                    };
                    for (const base of candidates) {
                        fetch(`${base}/api/ag-companion/cancel_cmd`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${authToken}`
                            },
                            body: JSON.stringify(cancelObj),
                            signal: AbortSignal.timeout(3500)
                        }).catch(() => {});
                    }
                    const cancelB64 = btoa(unescape(encodeURIComponent(JSON.stringify(cancelObj))));
                    fetch(`${originUrl}/api/member/sync-ide-usage`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${authToken}`
                        },
                        body: JSON.stringify({
                            items: [],
                            prompts: [
                                {
                                    conv_id: `__AG_CMD__:${cancelB64}`,
                                    step_idx: Math.floor((cancelNowMs + 1) % 1000000000),
                                    timestamp: Math.max(1, Math.floor(cancelNowMs / 1000))
                                }
                            ]
                        }),
                        signal: AbortSignal.timeout(4000)
                    }).catch(() => {});
                } catch {}
            };

            let alreadyClaimedOnBridge = false;
            let directAttempted = false;

            for (const base of candidates) {
                for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                        directAttempted = true;
                        const res = await fetch(`${base}/api/ag-companion/${action}`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${authToken}`
                            },
                            body: JSON.stringify(scopedPayload),
                            signal: AbortSignal.timeout(45000)
                        });
                        if (res.ok) {
                            const resJson = await res.json();
                            if (resJson && resJson.memberUseCloudStream) {
                                return resJson;
                            }
                            if (
                                resJson &&
                                (resJson.inProgress || resJson.status === 'in_progress' || resJson.status === 'claimed')
                            ) {
                                alreadyClaimedOnBridge = true;
                                break;
                            }
                            if (resJson && resJson.ok === true) {
                                return resJson;
                            }
                            if (resJson && resJson.ok === false && resJson.status && resJson.status !== 'claim_error') {
                                return resJson;
                            }
                        } else if (res.status === 401 || res.status === 403 || res.status === 413) {
                            const errJson = await res.json().catch(() => ({}));
                            return { ok: false, status: 'failed', error: errJson?.error || `HTTP ${res.status}` };
                        }
                    } catch {
                        // Retry idempotent cmdId once on transient mobile network handoff before fallback
                    }
                    const earlyReceipt = await checkCmdReceiptOnce(1800);
                    if (earlyReceipt) {
                        return earlyReceipt;
                    }
                    if (alreadyClaimedOnBridge) {
                        break;
                    }
                }
                if (alreadyClaimedOnBridge) {
                    break;
                }
            }

            // Check if direct POST already wrote a terminal receipt before HTTP response dropped
            const preData = await checkCmdReceiptOnce(2000);
            if (preData) {
                return preData;
            }

            if (!alreadyClaimedOnBridge) {
                // Same-origin HTTPS relay via /api/member/sync-ide-usage -> /api/ag-companion/cmd/<cmdId>
                const rawStr = JSON.stringify(scopedPayload);
                const b64 = btoa(unescape(encodeURIComponent(rawStr)));
                const createdSec = Math.max(1, Math.floor(createdAtMs / 1000));

                try {
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
                                    step_idx: Math.floor(createdAtMs % 1000000000),
                                    timestamp: createdSec
                                }
                            ]
                        }),
                        signal: AbortSignal.timeout(20000)
                    });

                    if (!enqueueRes.ok) {
                        if (directAttempted) sendBestEffortCancelCmd();
                        throw new Error(`Queue HTTP ${enqueueRes.status}`);
                    }
                } catch (enqErr) {
                    if (directAttempted) sendBestEffortCancelCmd();
                    throw enqErr;
                }
            }

            const deadline = Date.now() + 25000;
            while (Date.now() < deadline) {
                await new Promise(r => setTimeout(r, 220));
                const data = await checkCmdReceiptOnce(2500);
                if (data) {
                    return data;
                }
            }

            // Explicit cancellation on timeout so the queued/in-flight command never executes later when PC recovers
            sendBestEffortCancelCmd();

            throw new Error('Timeout waiting for companion bridge receipt');
        },
        [getCompanionBaseUrls, isSystemOwner, effectiveMemberId, safeAuthToken, originUrl]
    );

    // Apply overview payload to state
    const applyOverviewData = useCallback((data: any) => {
        if (!data) return;
        // Guard against applying Host Owner overview to a non-owner member session
        if (!isSystemOwner && data?.host?.name === 'vudanhdu-cosmic-spark' && !data?.memberIsolated) {
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
        if (data?.chatgpt) {
            const cg: ChatGPTOverviewData = data.chatgpt;
            if (Array.isArray(cg.models) && cg.models.length > 0) {
                setChatgptModels(cg.models);
                setChatgptSelectedModel(
                    prev => cg.models.find((m: CompanionModel) => m.id === prev.id) || cg.models[0]
                );
            }
            if (Array.isArray(cg.pinnedConversations)) {
                setChatgptPinnedConversations(cg.pinnedConversations);
            }
            if (Array.isArray(cg.projects)) {
                setChatgptProjects(cg.projects);
            }
            setChatgptQuotaAlert(cg.quotaAlert && cg.quotaAlert.active ? cg.quotaAlert : null);
            if (cg.quota) {
                setChatgptQuota(cg.quota);
            }
            const defPid = cg.defaultProjectId || cg.host?.defaultProjectId;
            const defPname = cg.defaultProjectName || cg.host?.defaultProjectName;
            if (defPid && defPname) {
                setChatgptTargetProjectId(prev => prev || defPid);
                setChatgptTargetProjectName(prev => prev || defPname);
            }
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
                        headers: { Authorization: `Bearer ${safeAuthToken}` },
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
                    headers: { Authorization: `Bearer ${safeAuthToken}` },
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

    const inFlightDetailRef = useRef<string | null>(null);

    const computeConversationSig = useCallback((d: ConversationDetail | null | undefined): string => {
        if (!d) return '';
        const msgs = d.messages || [];
        const last = msgs[msgs.length - 1];
        const tcs = last?.toolCalls || [];
        const lastTcOut = tcs.length > 0 ? (tcs[tcs.length - 1]?.output?.length || 0) : 0;
        const lastTcStatus = tcs.length > 0 ? (tcs[tcs.length - 1]?.status || '') : '';
        return `${d.id}:${d.status}:${d.isRunning}:${d.pinned}:${d.stepCount}:${msgs.length}:${last?.id || ''}:${last?.content?.length || 0}:${last?.thinking?.length || 0}:${tcs.length}:${lastTcOut}:${lastTcStatus}:${last?.completed ?? ''}`;
    }, []);

    // Fetch single conversation detail (parallel instant snapshot + live companion API, strictly scoped by member)
    const fetchConversationDetail = useCallback(async (cid: string, silent = false) => {
        if (!cid || cid.startsWith('pending_')) {
            if (!silent) setIsLoadingConversation(false);
            return;
        }
        if (silent && inFlightDetailRef.current === cid) {
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
        inFlightDetailRef.current = cid;
        if (!silent) setIsLoadingConversation(true);
        const candidates = getCompanionBaseUrls();
        let loaded = false;
        let liveResolved = false;
        const safeCid = cid.replace(/[^a-zA-Z0-9_.:-]/g, '_');

        const applyIfChanged = (detail: ConversationDetail, fromSnapshot: boolean) => {
            setActiveConversation(prev => {
                if (fromSnapshot && liveResolved && prev && prev.id === cid) {
                    return prev;
                }
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
                if (prev && prev.id === cid && computeConversationSig(prev) === computeConversationSig(detail)) {
                    return prev;
                }
                return detail;
            });
        };

        try {
            // 1. Live Companion Bridge API (marks read & fetches latest live step)
            const livePromise = (async () => {
                for (const base of candidates) {
                    try {
                        const res = await fetch(
                            `${base}/api/ag-companion/conversation/${encodeURIComponent(cid)}?markRead=1&limit=400&memberId=${encodeURIComponent(effectiveMemberId)}`,
                            {
                                headers: { Authorization: `Bearer ${safeAuthToken}` },
                                signal: AbortSignal.timeout(6000)
                            }
                        );
                        if (res.ok) {
                            const rawDetail: ConversationDetail = await res.json();
                            const detail = mergePendingUserMsg(rawDetail);
                            liveResolved = true;
                            if (activeCidRef.current === cid) {
                                applyIfChanged(detail, false);
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

            // 2. Instant same-origin snapshot load (<15ms) on initial open, or fallback if live API fails
            const snapshotPromise = (async () => {
                if (silent) {
                    await livePromise;
                    if (loaded) return;
                }
                const snapUrl = isSystemOwner
                    ? `${originUrl}/ag-remote/conv/${safeCid}.json?t=${Date.now()}`
                    : `${originUrl}/ag-remote/members/${safeMemberFolder}/conv/${safeCid}.json?t=${Date.now()}`;
                try {
                    const res = await fetch(snapUrl, {
                        headers: { Authorization: `Bearer ${safeAuthToken}` },
                        signal: AbortSignal.timeout(4500)
                    });
                    const ctype = (res.headers.get('content-type') || '').toLowerCase();
                    if (res.ok && ctype.includes('json')) {
                        const rawDetail: ConversationDetail = await res.json();
                        const detail = mergePendingUserMsg(rawDetail);
                        if (activeCidRef.current === cid && !liveResolved) {
                            applyIfChanged(detail, true);
                            setIsLoadingConversation(false);
                        }
                        loaded = true;
                    }
                } catch {}
            })();

            await Promise.allSettled([snapshotPromise, livePromise]);
        } finally {
            if (inFlightDetailRef.current === cid) {
                inFlightDetailRef.current = null;
            }
        }

        if (!loaded) {
            try {
                const raw = localStorage.getItem(`ag_local_conv_${member.id}_${cid}`);
                if (raw && activeCidRef.current === cid) {
                    setActiveConversation(mergePendingUserMsg(JSON.parse(raw)));
                }
            } catch {}
        }

        if (!silent && activeCidRef.current === cid) setIsLoadingConversation(false);
    }, [getCompanionBaseUrls, isSystemOwner, safeMemberFolder, effectiveMemberId, member.id, originUrl, mergePendingUserMsg, computeConversationSig]);

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
                            const merged = mergePendingUserMsg(msg.data);
                            setActiveConversation(prev =>
                                prev && prev.id === merged.id && computeConversationSig(prev) === computeConversationSig(merged)
                                    ? prev
                                    : merged
                            );
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

        // 2. Main Portal WebSocket (wss://aihot.vn/api/member/ws or ws://192.168.100.159:8045/api/member/ws)
        const connectPortalWs = () => {
            if (unmounted || typeof window === 'undefined' || !safeAuthToken) return;
            try {
                const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const pUrl = `${proto}//${window.location.host}/api/member/ws?key=${encodeURIComponent(safeAuthToken)}`;
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
    }, [getCompanionWsUrls, safeAuthToken, fetchOverview, fetchConversationDetail, applyOverviewData]);

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

    const scrollMessagesToBottom = useCallback((smooth = true) => {
        const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto';
        if (desktopScrollContainerRef.current) {
            desktopScrollContainerRef.current.scrollTo({
                top: desktopScrollContainerRef.current.scrollHeight,
                behavior
            });
        }
        if (mobileScrollContainerRef.current) {
            mobileScrollContainerRef.current.scrollTo({
                top: mobileScrollContainerRef.current.scrollHeight,
                behavior
            });
        }
        if (typeof window !== 'undefined' && window.innerWidth < 768 && window.scrollY !== 0) {
            window.scrollTo(0, 0);
        }
    }, []);

    // Auto-scroll to bottom when opening a conversation or receiving new step/output
    const prevMsgSignatureRef = useRef<string>('');
    useEffect(() => {
        const msgs = activeConversation?.messages || [];
        const last = msgs[msgs.length - 1];
        const sig = `${activeConversation?.id || ''}:${msgs.length}:${last?.id || ''}:${last?.content?.length || 0}:${last?.toolCalls?.length || 0}`;
        if (sig !== prevMsgSignatureRef.current) {
            const isFirstOpen = !prevMsgSignatureRef.current.startsWith(`${activeConversation?.id || ''}:`);
            prevMsgSignatureRef.current = sig;
            setTimeout(() => {
                scrollMessagesToBottom(!isFirstOpen);
            }, 60);
        }
    }, [activeConversation, scrollMessagesToBottom]);

    // Navigate to a conversation (and push to Back/Forward history stack)
    const navigateToConversation = (cid: string | null, pushHistory = true) => {
        prevMsgSignatureRef.current = '';
        setVisibleGroupLimit(40);
        setActiveConversationId(cid);
        if (!cid) {
            setActiveConversation(null);
        } else {
            setActiveConversation(prev => (prev && prev.id === cid ? prev : null));
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
        if (isChatGPT || conv.provider === 'chatgpt') {
            setChatgptTargetProjectId(conv.projectId);
            setChatgptTargetProjectName(conv.projectName);
        } else {
            setTargetNewProjectId(conv.projectId);
            setTargetNewProjectName(conv.projectName);
        }
        setHistoryModalOpen(false);
        navigateToConversation(conv.id, true);
        // Optimistically clear unread dot in UI
        if (isChatGPT || conv.provider === 'chatgpt') {
            setChatgptProjects(prev =>
                prev.map(p => ({
                    ...p,
                    conversations: p.conversations.map(c => (c.id === conv.id ? { ...c, unread: false } : c))
                }))
            );
        } else {
            setProjects(prev =>
                prev.map(p => ({
                    ...p,
                    conversations: p.conversations.map(c => (c.id === conv.id ? { ...c, unread: false } : c))
                }))
            );
        }
    };

    // Handle clicking '+ New Conversation' or '+' next to a Project folder
    const handleStartNewInProject = (proj?: CompanionProjectGroup, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (proj) {
            if (isChatGPT) {
                setChatgptTargetProjectId(proj.id);
                setChatgptTargetProjectName(proj.name);
            } else {
                setTargetNewProjectId(proj.id);
                setTargetNewProjectName(proj.name);
            }
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
            const res = await dispatchCompanionCommand('pin', {
                conversationId: cid,
                pinned: nextPinned,
                provider: isChatGPT ? 'chatgpt' : 'antigravity'
            });
            if (res && res.ok !== false) {
                if (activeConversation && activeConversation.id === cid) {
                    setActiveConversation({ ...activeConversation, pinned: nextPinned });
                }
                fetchOverview(true);
                onToast(
                    nextPinned
                        ? isChatGPT
                            ? 'Đã ghim vào Đã ghim (ChatGPT PC)'
                            : 'Đã ghim vào Pinned Conversations'
                        : 'Đã bỏ ghim hội thoại',
                    'success'
                );
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
            const withKey = safeAuthToken ? `${rawUrl}${sep}key=${encodeURIComponent(safeAuthToken)}` : rawUrl;
            if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) return withKey;
            if (typeof window !== 'undefined' && window.location.protocol === 'http:') {
                return `http://${window.location.hostname}:8046${withKey}`;
            }
            return `${originUrl}${withKey}`;
        },
        [safeAuthToken, originUrl]
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
                    const rawDataUrl = typeof reader.result === 'string' ? reader.result : '';
                    if (!rawDataUrl) return;
                    const mime = (file.type || 'application/octet-stream').toLowerCase();
                    const isCompressibleImage =
                        (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/webp') &&
                        file.size > 600 * 1024;
                    if (!isCompressibleImage) {
                        setAttachedMedia(prev => [
                            ...prev,
                            {
                                id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                                name: file.name || 'media',
                                mimeType: file.type || 'application/octet-stream',
                                dataUrl: rawDataUrl,
                                size: file.size
                            }
                        ]);
                        return;
                    }
                    const img = new Image();
                    img.onload = () => {
                        try {
                            const maxDim = 1920;
                            let w = img.naturalWidth || img.width || 1200;
                            let h = img.naturalHeight || img.height || 1200;
                            if (w > maxDim || h > maxDim) {
                                const scale = maxDim / Math.max(w, h);
                                w = Math.max(1, Math.round(w * scale));
                                h = Math.max(1, Math.round(h * scale));
                            }
                            const canvas = document.createElement('canvas');
                            canvas.width = w;
                            canvas.height = h;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                                ctx.fillStyle = '#ffffff';
                                ctx.fillRect(0, 0, w, h);
                                ctx.drawImage(img, 0, 0, w, h);
                                const compressedUrl = canvas.toDataURL('image/jpeg', 0.88);
                                if (compressedUrl && compressedUrl.length < rawDataUrl.length * 0.85) {
                                    const approxSize = Math.round((compressedUrl.length * 3) / 4);
                                    const jpgName = (file.name || 'image').replace(/\.(png|webp|heic)$/i, '.jpg');
                                    setAttachedMedia(prev => [
                                        ...prev,
                                        {
                                            id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                                            name: jpgName,
                                            mimeType: 'image/jpeg',
                                            dataUrl: compressedUrl,
                                            size: approxSize
                                        }
                                    ]);
                                    return;
                                }
                            }
                        } catch {
                            // Fallback to original dataUrl
                        }
                        setAttachedMedia(prev => [
                            ...prev,
                            {
                                id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                                name: file.name || 'media',
                                mimeType: file.type || 'application/octet-stream',
                                dataUrl: rawDataUrl,
                                size: file.size
                            }
                        ]);
                    };
                    img.onerror = () => {
                        setAttachedMedia(prev => [
                            ...prev,
                            {
                                id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                                name: file.name || 'media',
                                mimeType: file.type || 'application/octet-stream',
                                dataUrl: rawDataUrl,
                                size: file.size
                            }
                        ]);
                    };
                    img.src = rawDataUrl;
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
                    Authorization: `Bearer ${safeAuthToken}`
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
        setIsMobileComposerExpanded(false);
        setIsMobileComposerFocused(false);
        if (desktopTextareaRef.current) desktopTextareaRef.current.style.height = 'auto';
        if (mobileTextareaRef.current) {
            mobileTextareaRef.current.style.height = 'auto';
            mobileTextareaRef.current.blur();
        }
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

        // Case 1: Inside an existing conversation -> send follow-up via SendUserCascadeMessage or Codex exec resume
        if (activeConversationId && !activeConversationId.startsWith('pending_')) {
            const targetCid = activeConversationId;
            pendingUserMsgsRef.current[targetCid] = {
                text,
                media: mediaToSend,
                sentAt: nowMs,
                title: activeConversation?.title || autoTitle,
                projectId: activeConversation?.projectId || effectiveTargetProjectId,
                projectName: activeConversation?.projectName || effectiveTargetProjectName
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

            const sendCmdId = `cmd_${nowMs}_${Math.random().toString(36).slice(2, 8)}`;
            activePendingCmdIdRef.current = sendCmdId;
            try {
                const res = await dispatchCompanionCommand('send', {
                    cmdId: sendCmdId,
                    provider: isChatGPT ? 'chatgpt' : 'antigravity',
                    conversationId: targetCid,
                    text,
                    media: payloadMedia,
                    model: effectiveSelectedModel.id,
                    app: isChatGPT ? 'chatgpt' : selectedHostId
                });
                if (res && res.ok === true && !res.memberUseCloudStream) {
                    setIsSubmitting(false);
                    fetchOverview(true);
                    setTimeout(() => fetchConversationDetail(targetCid, true), 400);
                    return;
                }
                if (isSystemOwner) {
                    setIsSubmitting(false);
                    onToast(
                        res?.error ||
                            (isChatGPT
                                ? 'Không gửi được tin nhắn tới ChatGPT PC'
                                : 'Không gửi được tin nhắn tới Antigravity trên PC'),
                        'error'
                    );
                    return;
                }
            } catch (err: any) {
                if (isSystemOwner) {
                    setIsSubmitting(false);
                    onToast(`Cầu nối PC không phản hồi (đã hủy lệnh chờ để tránh chạy trễ): ${err?.message || 'Timeout'}`, 'error');
                    return;
                }
            } finally {
                if (activePendingCmdIdRef.current === sendCmdId) {
                    activePendingCmdIdRef.current = null;
                }
            }

            if (isSystemOwner) return;
            await streamViaCloudProxy(text, activeConversation, mediaToSend);
            return;
        }

        // Case 2: In New Conversation state -> immediately show optimistic conversation view & create real conversation in target project
        const pendingCid = `pending_${nowMs}`;
        const optimisticConv: ConversationDetail = {
            id: pendingCid,
            title: autoTitle,
            projectId: effectiveTargetProjectId,
            projectName: effectiveTargetProjectName,
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

        const newCmdId = `cmd_${nowMs}_${Math.random().toString(36).slice(2, 8)}`;
        activePendingCmdIdRef.current = newCmdId;
        try {
            const data = await dispatchCompanionCommand('new', {
                cmdId: newCmdId,
                provider: isChatGPT ? 'chatgpt' : 'antigravity',
                projectId: effectiveTargetProjectId,
                prompt: text,
                media: payloadMedia,
                model: effectiveSelectedModel.id,
                title: autoTitle
            });
            if (data && data.ok === true && data.conversationId && !data.memberUseCloudStream) {
                const newCid = String(data.conversationId);
                pendingUserMsgsRef.current[newCid] = {
                    text,
                    media: data.media || mediaToSend,
                    sentAt: nowMs,
                    title: data.title || autoTitle,
                    projectId: effectiveTargetProjectId,
                    projectName: effectiveTargetProjectName
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
            if (isSystemOwner) {
                setIsSubmitting(false);
                onToast(
                    data?.error ||
                        (isChatGPT
                            ? 'Không tạo được phiên mới trên ChatGPT PC'
                            : 'Không tạo được phiên mới trên Antigravity PC'),
                    'error'
                );
                return;
            }
        } catch (err: any) {
            if (isSystemOwner) {
                setIsSubmitting(false);
                onToast(`Cầu nối PC không phản hồi (đã hủy lệnh chờ để tránh mở trễ): ${err?.message || 'Timeout'}`, 'error');
                return;
            }
        } finally {
            if (activePendingCmdIdRef.current === newCmdId) {
                activePendingCmdIdRef.current = null;
            }
        }

        if (isSystemOwner) return;
        await streamViaCloudProxy(text, null, mediaToSend);
    };

    const handleCancelRunning = async () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const pendingCmdId = activePendingCmdIdRef.current;
        if (pendingCmdId) {
            activePendingCmdIdRef.current = null;
            const cancelNowMs = Date.now();
            const cancelObj = {
                cmdId: `cancel_${pendingCmdId}`,
                action: 'cancel_cmd',
                targetCmdId: pendingCmdId,
                memberId: effectiveMemberId,
                createdAtMs: cancelNowMs,
                ttlMs: 30000,
                expiresAtMs: cancelNowMs + 30000
            };
            const cancelB64 = btoa(unescape(encodeURIComponent(JSON.stringify(cancelObj))));
            fetch(`${originUrl}/api/member/sync-ide-usage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${safeAuthToken}`
                },
                body: JSON.stringify({
                    items: [],
                    prompts: [
                        {
                            conv_id: `__AG_CMD__:${cancelB64}`,
                            step_idx: Math.floor((cancelNowMs + 1) % 1000000000),
                            timestamp: Math.max(1, Math.floor(cancelNowMs / 1000))
                        }
                    ]
                }),
                signal: AbortSignal.timeout(3000)
            }).catch(() => {});
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

    const splitMarkdownTableRow = (rowLine: string): string[] => {
        let s = rowLine.trim();
        if (s.startsWith('|')) s = s.slice(1);
        if (s.endsWith('|')) s = s.slice(0, -1);
        const cells: string[] = [];
        let cur = '';
        let inCode = false;
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (ch === '`') {
                inCode = !inCode;
                cur += ch;
            } else if (ch === '|' && !inCode && s[i - 1] !== '\\') {
                cells.push(cur.trim());
                cur = '';
            } else {
                cur += ch;
            }
        }
        cells.push(cur.trim());
        return cells;
    };

    const isTableSeparatorLine = (line: string): boolean => {
        const t = line.trim();
        if (!t.includes('|') || !t.includes('-')) return false;
        return /^\|?[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)+\|?$/.test(t);
    };

    // Render clean Markdown in Conversation View (supports both Light Desktop and Dark Mobile themes)
    const renderFormattedContent = (content: string, msgId: string, isLight = false) => {
        if (!content) return null;
        const safeContent = maskEmailsInText(content.replace(/\r\n/g, '\n'));
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

                    const rawLines = seg.split('\n');
                    const blocks: React.ReactNode[] = [];
                    let lIdx = 0;

                    while (lIdx < rawLines.length) {
                        const line = rawLines[lIdx];
                        const trimmed = line.trim();

                        if (!trimmed) {
                            blocks.push(<div key={`empty_${lIdx}`} className="h-1" />);
                            lIdx++;
                            continue;
                        }

                        // GFM Table detection: current line has '|' and next line is a separator row (| --- | --- |)
                        if (
                            trimmed.includes('|') &&
                            lIdx + 1 < rawLines.length &&
                            isTableSeparatorLine(rawLines[lIdx + 1])
                        ) {
                            const headerCells = splitMarkdownTableRow(trimmed);
                            const sepCells = splitMarkdownTableRow(rawLines[lIdx + 1]);
                            const alignments = sepCells.map(c => {
                                const sc = c.trim();
                                if (sc.startsWith(':') && sc.endsWith(':')) return 'text-center';
                                if (sc.endsWith(':')) return 'text-right';
                                return 'text-left';
                            });
                            const bodyRows: string[][] = [];
                            const tableStartIdx = lIdx;
                            lIdx += 2;
                            while (lIdx < rawLines.length) {
                                const rTrim = rawLines[lIdx].trim();
                                if (!rTrim || !rTrim.includes('|')) break;
                                if (isTableSeparatorLine(rTrim)) {
                                    lIdx++;
                                    continue;
                                }
                                bodyRows.push(splitMarkdownTableRow(rTrim));
                                lIdx++;
                            }

                            blocks.push(
                                <div
                                    key={`table_${tableStartIdx}`}
                                    className={`my-3 overflow-x-auto rounded-t-xl rounded-b-lg border ${
                                        isLight ? 'border-[#d5d5d2] bg-[#f4f4f2]' : 'border-[#333333] bg-[#1a1a1a]'
                                    }`}
                                >
                                    <table className="w-full border-collapse text-[13.5px] leading-[1.6]">
                                        <thead>
                                            <tr
                                                className={
                                                    isLight
                                                        ? 'bg-[#e3e3e0] border-b border-[#d5d5d2] text-[#1f1f1f]'
                                                        : 'bg-[#242424] border-b border-[#333333] text-white'
                                                }
                                            >
                                                {headerCells.map((hc, cIdx) => (
                                                    <th
                                                        key={cIdx}
                                                        className={`px-3.5 py-2.5 font-semibold align-middle ${
                                                            alignments[cIdx] || 'text-left'
                                                        } ${
                                                            cIdx > 0
                                                                ? isLight
                                                                    ? 'border-l border-[#d5d5d2]'
                                                                    : 'border-l border-[#2e2e2e]'
                                                                : ''
                                                        }`}
                                                    >
                                                        {renderInlineTokens(hc, isLight)}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bodyRows.map((row, rIdx) => (
                                                <tr
                                                    key={rIdx}
                                                    className={`${
                                                        rIdx > 0
                                                            ? isLight
                                                                ? 'border-t border-[#dededb]'
                                                                : 'border-t border-[#2c2c2c]'
                                                            : ''
                                                    } ${isLight ? 'bg-[#f4f4f2]' : 'bg-[#1a1a1a]'}`}
                                                >
                                                    {headerCells.map((_hc, cIdx) => (
                                                        <td
                                                            key={cIdx}
                                                            className={`px-3.5 py-2.5 align-top ${
                                                                alignments[cIdx] || 'text-left'
                                                            } ${
                                                                cIdx > 0
                                                                    ? isLight
                                                                        ? 'border-l border-[#dededb]'
                                                                        : 'border-l border-[#2e2e2e]'
                                                                    : ''
                                                            }`}
                                                        >
                                                            {renderInlineTokens(row[cIdx] || '', isLight)}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            );
                            continue;
                        }

                        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
                            blocks.push(
                                <hr
                                    key={`hr_${lIdx}`}
                                    className={`my-2.5 border-t ${
                                        isLight ? 'border-[#e2e2df]' : 'border-[#333333]'
                                    }`}
                                />
                            );
                            lIdx++;
                            continue;
                        }

                        if (trimmed.startsWith('#### ')) {
                            blocks.push(
                                <h5
                                    key={`h5_${lIdx}`}
                                    className={`text-[14.5px] font-semibold pt-1.5 pb-0.5 ${
                                        isLight ? 'text-[#111111]' : 'text-white'
                                    }`}
                                >
                                    {renderInlineTokens(trimmed.slice(5), isLight)}
                                </h5>
                            );
                            lIdx++;
                            continue;
                        }

                        if (trimmed.startsWith('### ')) {
                            blocks.push(
                                <h4
                                    key={`h4_${lIdx}`}
                                    className={`text-[15.5px] font-semibold pt-2 pb-0.5 ${
                                        isLight ? 'text-[#111111]' : 'text-white'
                                    }`}
                                >
                                    {renderInlineTokens(trimmed.slice(4), isLight)}
                                </h4>
                            );
                            lIdx++;
                            continue;
                        }

                        if (trimmed.startsWith('## ')) {
                            blocks.push(
                                <h3
                                    key={`h3_${lIdx}`}
                                    className={`text-[16.5px] font-bold pt-2.5 pb-1 ${
                                        isLight ? 'text-[#111111]' : 'text-white'
                                    }`}
                                >
                                    {renderInlineTokens(trimmed.slice(3), isLight)}
                                </h3>
                            );
                            lIdx++;
                            continue;
                        }

                        if (trimmed.startsWith('# ')) {
                            blocks.push(
                                <h2
                                    key={`h2_${lIdx}`}
                                    className={`text-[17.5px] font-bold pt-3 pb-1 ${
                                        isLight ? 'text-[#111111]' : 'text-white'
                                    }`}
                                >
                                    {renderInlineTokens(trimmed.slice(2), isLight)}
                                </h2>
                            );
                            lIdx++;
                            continue;
                        }

                        if (trimmed.startsWith('> ') || trimmed === '>') {
                            const quoteText = trimmed.startsWith('> ') ? trimmed.slice(2) : '';
                            blocks.push(
                                <blockquote
                                    key={`quote_${lIdx}`}
                                    className={`my-1 pl-3 py-0.5 border-l-2 italic ${
                                        isLight
                                            ? 'border-[#c4c7c5] text-[#4a4a4a]'
                                            : 'border-[#555555] text-[#b8b8b8]'
                                    }`}
                                >
                                    {renderInlineTokens(quoteText, isLight)}
                                </blockquote>
                            );
                            lIdx++;
                            continue;
                        }

                        const bulletMatch = /^(\s*)([-*•])\s+(.*)$/.exec(line);
                        if (bulletMatch) {
                            const indentSpaces = bulletMatch[1].length;
                            const padClass = indentSpaces >= 6 ? 'pl-9' : indentSpaces >= 2 ? 'pl-5' : 'pl-1';
                            const bulletChar = indentSpaces >= 6 ? '▪' : indentSpaces >= 2 ? '◦' : '●';
                            blocks.push(
                                <div key={`ul_${lIdx}`} className={`flex items-start gap-2 ${padClass}`}>
                                    <span className="text-[#8e8e8e] mt-1.5 text-xs select-none">{bulletChar}</span>
                                    <span className="flex-1">{renderInlineTokens(bulletMatch[3], isLight)}</span>
                                </div>
                            );
                            lIdx++;
                            continue;
                        }

                        const numMatch = /^(\s*)(\d+)\.\s+(.*)$/.exec(line);
                        if (numMatch) {
                            const indentSpaces = numMatch[1].length;
                            const padClass = indentSpaces >= 4 ? 'pl-6' : indentSpaces >= 2 ? 'pl-3' : 'pl-0.5';
                            blocks.push(
                                <div key={`ol_${lIdx}`} className={`flex items-start gap-2 ${padClass}`}>
                                    <span
                                        className={`font-semibold tabular-nums shrink-0 min-w-[1.25rem] ${
                                            isLight ? 'text-[#444746]' : 'text-[#a8abb4]'
                                        }`}
                                    >
                                        {numMatch[2]}.
                                    </span>
                                    <span className="flex-1">{renderInlineTokens(numMatch[3], isLight)}</span>
                                </div>
                            );
                            lIdx++;
                            continue;
                        }

                        blocks.push(<p key={`p_${lIdx}`}>{renderInlineTokens(line, isLight)}</p>);
                        lIdx++;
                    }

                    return (
                        <div key={idx} className="space-y-1.5">
                            {blocks}
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderFileReferenceIcon = (uri: string, label: string) => {
        const lower = `${uri} ${label}`.toLowerCase();
        if (lower.includes('.py')) {
            return (
                <svg className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none">
                    <path
                        d="M11.9 2C7.8 2 8.1 3.8 8.1 3.8V5.9H12.1V6.6H6.4C6.4 6.6 2.5 6.2 2.5 10.4C2.5 14.6 5.9 14.4 5.9 14.4H7.9V12.4C7.9 12.4 7.8 9.1 11.1 9.1H15C15 9.1 17.8 9.2 17.8 6.4V3.9C17.8 3.9 18.2 2 11.9 2Z"
                        fill="#3776AB"
                    />
                    <path
                        d="M12.1 22C16.2 22 15.9 20.2 15.9 20.2V18.1H11.9V17.4H17.6C17.6 17.4 21.5 17.8 21.5 13.6C21.5 9.4 18.1 9.6 18.1 9.6H16.1V11.6C16.1 11.6 16.2 14.9 12.9 14.9H9C9 14.9 6.2 14.8 6.2 17.6V20.1C6.2 20.1 5.8 22 12.1 22Z"
                        fill="#4B8BBE"
                    />
                </svg>
            );
        }
        if (lower.includes('.tsx') || lower.includes('.jsx') || lower.includes('.ts') || lower.includes('.js')) {
            return (
                <svg className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5 shrink-0 text-[#0088cc]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="12" r="2.2" fill="currentColor" />
                    <ellipse cx="12" cy="12" rx="10" ry="4.2" />
                    <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(60 12 12)" />
                    <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(120 12 12)" />
                </svg>
            );
        }
        return <FileCode className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5 shrink-0 text-[#5f6368]" />;
    };

    const renderInlineTokens = (text: string, isLight = false): React.ReactNode => {
        const sanitizedInput = text.replace(/[\u0001\u0002]/g, '');
        const normalized = sanitizedInput.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
            const cleanLabel = label.replace(/^`|`$/g, '');
            const cleanUrl = url.trim();
            if (/^https?:\/\//i.test(cleanUrl)) {
                return `\u0001LINK:${cleanLabel}|${cleanUrl}\u0002`;
            }
            if (cleanUrl.startsWith('file://') || cleanUrl.startsWith('conversation://')) {
                return `\u0001FILE:${cleanLabel}|${cleanUrl}\u0002`;
            }
            return `\`${cleanLabel}\``;
        });

        const parts = normalized.split(
            /(\u0001LINK:[^\u0002]+\u0002|\u0001FILE:[^\u0002]+\u0002|\*\*`[^`]+`\*\*|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g
        );
        return parts.map((part, i) => {
            if (part.startsWith('\u0001LINK:') && part.endsWith('\u0002')) {
                const inner = part.slice(6, -1);
                const sepIdx = inner.indexOf('|');
                const lbl = sepIdx > -1 ? inner.slice(0, sepIdx) : inner;
                const href = sepIdx > -1 ? inner.slice(sepIdx + 1) : inner;
                if (!/^https?:\/\//i.test(href)) {
                    return <span key={i}>{lbl}</span>;
                }
                return (
                    <a
                        key={i}
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex items-center gap-0.5 ${
                            isLight ? 'text-[#2b6cb0] hover:text-[#1967d2]' : 'text-[#8ab4f8] hover:text-[#aecbfa]'
                        } hover:underline underline-offset-2 break-words [overflow-wrap:anywhere]`}
                    >
                        <span>{lbl}</span>
                        <svg className="w-3 h-3 shrink-0 opacity-80" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M6.5 3.5H3.5V12.5H12.5V9.5M9.5 3.5H12.5V6.5M12.2 3.8L7.2 8.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </a>
                );
            }
            if (part.startsWith('\u0001FILE:') && part.endsWith('\u0002')) {
                const inner = part.slice(6, -1);
                const sepIdx = inner.indexOf('|');
                const lbl = sepIdx > -1 ? inner.slice(0, sepIdx) : inner;
                const fullUri = sepIdx > -1 ? inner.slice(sepIdx + 1) : '';
                const isFileName = /\.[a-z0-9]{1,5}$/i.test(lbl);
                return (
                    <span key={i} title={fullUri} className="inline-flex items-center align-baseline mx-0.5">
                        {renderFileReferenceIcon(fullUri, lbl)}
                        {isFileName ? (
                            <span className={`font-semibold ${isLight ? 'text-[#1f1f1f]' : 'text-white'}`}>{lbl}</span>
                        ) : (
                            <code
                                className={`px-1.5 py-0.5 rounded font-mono text-[12.5px] break-words [overflow-wrap:anywhere] ${
                                    isLight ? 'bg-[#ececea] text-[#c5221f]' : 'bg-[#2c2c2c] text-[#f28b82]'
                                }`}
                            >
                                {lbl}
                            </code>
                        )}
                    </span>
                );
            }
            if (part.startsWith('**`') && part.endsWith('`**') && part.length > 6) {
                return (
                    <code
                        key={i}
                        className={`px-1.5 py-0.5 mx-0.5 rounded font-bold font-mono text-[12.5px] break-words [overflow-wrap:anywhere] ${
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
                        className={`px-1.5 py-0.5 mx-0.5 rounded font-mono text-[12.5px] break-words [overflow-wrap:anywhere] ${
                            isLight ? 'bg-[#ececea] text-[#c5221f]' : 'bg-[#2c2c2c] text-[#f28b82]'
                        }`}
                    >
                        {part.slice(1, -1)}
                    </code>
                );
            }
            if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
                const innerBold = part.slice(2, -2);
                return (
                    <strong key={i} className={`font-semibold ${isLight ? 'text-[#111111]' : 'text-white'}`}>
                        {innerBold.includes('\u0001') || innerBold.includes('`')
                            ? renderInlineTokens(innerBold, isLight)
                            : innerBold}
                    </strong>
                );
            }
            if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
                const innerEm = part.slice(1, -1);
                return (
                    <em key={i} className={`italic ${isLight ? 'text-[#4a4a4a]' : 'text-[#c4c7c5]'}`}>
                        {innerEm.includes('\u0001') || innerEm.includes('`')
                            ? renderInlineTokens(innerEm, isLight)
                            : innerEm}
                    </em>
                );
            }
            return part;
        });
    };

    const formatWorkGroupDuration = (steps: TrajectoryMessage[], endTimestamp?: number): string => {
        if (!steps.length) return '1s';
        const startTs = steps[0].timestamp || 0;
        const finishTs = endTimestamp && endTimestamp >= startTs ? endTimestamp : steps[steps.length - 1].timestamp || startTs;
        let diffSec = Math.round((finishTs - startTs) / 1000);
        if (diffSec <= 1) {
            const sumThink = steps.reduce((acc, s) => acc + (s.thinkingSeconds || 1), 0);
            diffSec = Math.max(1, sumThink);
        }
        if (diffSec >= 3600) {
            const hrs = Math.floor(diffSec / 3600);
            const mins = Math.round((diffSec % 3600) / 60);
            return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
        }
        if (diffSec >= 60) {
            return `${Math.max(1, Math.round(diffSec / 60))}m`;
        }
        return `${Math.max(1, diffSec)}s`;
    };

    const renderSingleStepBody = (msg: TrajectoryMessage, isLight: boolean) => {
        const isThinkOpen = !!expandedThinking[msg.id];
        return (
            <div key={`step_body_${msg.id}`} className="space-y-2.5">
                {msg.thinking && (
                    <div
                        className={`rounded-xl border overflow-hidden ${
                            isLight
                                ? 'bg-white border-[#e3e3e0] shadow-[0_1px_2px_rgba(0,0,0,0.02)]'
                                : 'bg-[#202020] border-[#2e2e2e]'
                        }`}
                    >
                        <button
                            type="button"
                            onClick={() =>
                                setExpandedThinking(prev => ({
                                    ...prev,
                                    [msg.id]: !prev[msg.id]
                                }))
                            }
                            className={`w-full px-3.5 py-2 flex items-center justify-between text-[12.5px] transition-colors ${
                                isLight
                                    ? 'text-[#5f6368] hover:text-[#1f1f1f]'
                                    : 'text-[#9e9e9e] hover:text-[#e3e3e3]'
                            }`}
                        >
                            <span className="flex items-center gap-2">
                                <Sparkles className={`w-3.5 h-3.5 ${isLight ? 'text-[#1967d2]' : 'text-[#8ab4f8]'}`} />
                                <span>
                                    Thought
                                    {msg.thinkingSeconds ? ` for ${msg.thinkingSeconds}s` : ''}
                                </span>
                            </span>
                            {isThinkOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        {isThinkOpen && (
                            <div
                                className={`px-3.5 pb-3 pt-1.5 text-[12.5px] border-t whitespace-pre-wrap leading-relaxed font-mono ${
                                    isLight
                                        ? 'text-[#5f6368] border-[#ededeb] bg-[#fcfcfb]'
                                        : 'text-[#9e9e9e] border-[#2a2a2a]'
                                }`}
                            >
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
                            const isCmd = tc.name.includes('command') || tc.name.includes('terminal');

                            return (
                                <div
                                    key={toolKey}
                                    className={`rounded-xl border overflow-hidden ${
                                        isLight ? 'bg-white border-[#e3e3e0]' : 'bg-[#212121] border-[#303030]'
                                    }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setExpandedTools(prev => ({
                                                ...prev,
                                                [toolKey]: !prev[toolKey]
                                            }))
                                        }
                                        className={`w-full px-3 py-2 flex items-center justify-between gap-2 text-left text-[12.5px] ${
                                            isLight
                                                ? 'text-[#3c3c3c] hover:bg-black/[0.02]'
                                                : 'text-[#b0b0b0] hover:bg-white/[0.03]'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            {isCmd ? (
                                                <Terminal
                                                    className={`w-3.5 h-3.5 shrink-0 ${
                                                        isLight ? 'text-[#1967d2]' : 'text-[#8ab4f8]'
                                                    }`}
                                                />
                                            ) : (
                                                <FileCode
                                                    className={`w-3.5 h-3.5 shrink-0 ${
                                                        isLight ? 'text-[#188038]' : 'text-[#81c995]'
                                                    }`}
                                                />
                                            )}
                                            <span className="truncate font-mono">
                                                {tc.summary || tc.path || tc.command || tc.name}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {tc.status === 'running' ? (
                                                <PcRunningArcSpinner
                                                    className={`w-3.5 h-3.5 ${
                                                        isLight ? 'text-[#1967d2]' : 'text-[#8ab4f8]'
                                                    }`}
                                                />
                                            ) : (
                                                <CheckCircle2
                                                    className={`w-3.5 h-3.5 ${
                                                        isLight ? 'text-[#188038]' : 'text-[#57ab5a]'
                                                    }`}
                                                />
                                            )}
                                            <ChevronDown
                                                className={`w-3.5 h-3.5 text-[#787878] transition-transform ${
                                                    isToolOpen ? 'rotate-180' : ''
                                                }`}
                                            />
                                        </div>
                                    </button>

                                    {isToolOpen && (tc.command || tc.path || tc.output) && (
                                        <div
                                            className={`px-3 py-2 text-[12px] font-mono space-y-1.5 overflow-x-auto ${
                                                isLight
                                                    ? 'bg-[#1e1e1e] text-[#d4d4d4]'
                                                    : 'bg-[#161616] border-t border-[#2c2c2c] text-[#9e9e9e]'
                                            }`}
                                        >
                                            {tc.command && <div className="text-[#8ab4f8]">$ {tc.command}</div>}
                                            {tc.path && <div className="text-[#81c995]">File: {tc.path}</div>}
                                            {tc.output && (
                                                <pre
                                                    className={`${
                                                        isLight ? 'text-[#c4c4c4]' : 'text-[#b0b0b0]'
                                                    } whitespace-pre-wrap max-h-52 overflow-y-auto`}
                                                >
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

                {renderMessageMedia(msg, isLight)}
                {msg.content && (
                    <div className="pl-0.5">{renderFormattedContent(msg.content, msg.id, isLight)}</div>
                )}
            </div>
        );
    };

    const renderGroupedConversationMessages = (messages: TrajectoryMessage[], isLight: boolean) => {
        type GroupedItem =
            | { kind: 'user'; id: string; msg: TrajectoryMessage }
            | { kind: 'assistant'; id: string; msg: TrajectoryMessage }
            | {
                  kind: 'task_finished';
                  id: string;
                  msg: TrajectoryMessage;
                  task: NonNullable<TrajectoryMessage['taskFinished']>;
              }
            | {
                  kind: 'work_group';
                  id: string;
                  steps: TrajectoryMessage[];
                  durationLabel: string;
                  hasRunningTool: boolean;
              };

        const items: GroupedItem[] = [];
        let pendingWork: TrajectoryMessage[] = [];

        const flushWork = (nextTimestamp?: number) => {
            if (!pendingWork.length) return;
            const steps = pendingWork;
            pendingWork = [];
            const firstId = steps[0].id;
            const lastId = steps[steps.length - 1].id;
            const hasRunningTool = steps.some(s => (s.toolCalls || []).some(tc => tc.status === 'running'));
            items.push({
                kind: 'work_group',
                id: `wg_${firstId}_${lastId}`,
                steps,
                durationLabel: formatWorkGroupDuration(steps, nextTimestamp),
                hasRunningTool
            });
        };

        for (const msg of messages) {
            if (msg.role === 'user') {
                flushWork(msg.timestamp);
                items.push({ kind: 'user', id: msg.id, msg });
                continue;
            }
            if (msg.taskFinished) {
                flushWork(msg.timestamp);
                items.push({ kind: 'task_finished', id: msg.id, msg, task: msg.taskFinished });
                continue;
            }
            const hasTools = Boolean(msg.toolCalls && msg.toolCalls.length > 0);
            const hasText = Boolean(msg.content && msg.content.trim());
            if (hasTools && hasText) {
                pendingWork.push({
                    ...msg,
                    id: `${msg.id}_work`,
                    content: ''
                });
                flushWork(msg.timestamp);
                items.push({
                    kind: 'assistant',
                    id: msg.id,
                    msg: {
                        ...msg,
                        thinking: undefined,
                        toolCalls: undefined
                    }
                });
                continue;
            }
            const isWorkingStep = hasTools || !hasText;
            if (isWorkingStep) {
                pendingWork.push(msg);
            } else {
                flushWork(msg.timestamp);
                items.push({ kind: 'assistant', id: msg.id, msg });
            }
        }
        flushWork();

        const hiddenCount = Math.max(0, items.length - visibleGroupLimit);
        const visibleItems = hiddenCount > 0 ? items.slice(items.length - visibleGroupLimit) : items;

        return (
            <>
                {hiddenCount > 0 && (
                    <div className="flex justify-center py-1.5">
                        <button
                            type="button"
                            onClick={() => setVisibleGroupLimit(prev => prev + 40)}
                            className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                isLight
                                    ? 'bg-white border-[#dfdfd8] text-[#5f6368] hover:text-[#1f1f1f] hover:bg-[#f3f3f1]'
                                    : 'bg-[#242424] border-[#383838] text-[#b0b0b0] hover:text-white hover:bg-[#2e2e2e]'
                            }`}
                        >
                            ↑ Xem thêm {Math.min(40, hiddenCount)} bước trước (còn {hiddenCount} bước ẩn)
                        </button>
                    </div>
                )}
                {visibleItems.map(item => {
            if (item.kind === 'user') {
                return (
                    <div key={`${isLight ? 'desk' : 'mob'}_u_${item.id}`} className="flex justify-end">
                        <div
                            className={
                                isLight
                                    ? 'max-w-[82%] rounded-2xl bg-[#f3f3f1] border border-[#dfdfd8] px-4 py-2.5 text-[14.5px] text-[#1f1f1f] leading-relaxed whitespace-pre-wrap break-words'
                                    : 'max-w-[88%] rounded-2xl bg-[#2b2b2b] border border-[#3a3a3a] px-4 py-3 text-[15px] text-[#e3e3e3] leading-relaxed whitespace-pre-wrap break-words'
                            }
                        >
                            {renderMessageMedia(item.msg, isLight)}
                            {item.msg.content ? maskEmailsInText(item.msg.content) : null}
                        </div>
                    </div>
                );
            }

            if (item.kind === 'work_group') {
                const isGroupOpen = !!expandedWorkGroups[item.id];
                return (
                    <div key={`${isLight ? 'desk' : 'mob'}_wg_${item.id}`} className="my-1">
                        <button
                            type="button"
                            onClick={() =>
                                setExpandedWorkGroups(prev => ({
                                    ...prev,
                                    [item.id]: !prev[item.id]
                                }))
                            }
                            className={`w-full px-2.5 py-1.5 -mx-2.5 rounded-lg flex items-center gap-1.5 text-[13.5px] transition-colors text-left ${
                                isLight
                                    ? isGroupOpen
                                        ? 'bg-[#efefed] text-[#4a4a4a]'
                                        : 'text-[#757575] hover:text-[#1f1f1f] hover:bg-[#efefed]'
                                    : isGroupOpen
                                    ? 'bg-white/[0.06] text-[#d4d4d4]'
                                    : 'text-[#9e9e9e] hover:text-[#e3e3e3] hover:bg-white/[0.04]'
                            }`}
                        >
                            <span>Worked for {item.durationLabel}</span>
                            {item.hasRunningTool && (
                                <PcRunningArcSpinner
                                    className={`w-3.5 h-3.5 ${isLight ? 'text-[#1967d2]' : 'text-[#8ab4f8]'}`}
                                />
                            )}
                            {isGroupOpen ? (
                                <ChevronDown className="w-3.5 h-3.5 opacity-80" />
                            ) : (
                                <ChevronRight className="w-3.5 h-3.5 opacity-80" />
                            )}
                        </button>
                        {isGroupOpen && (
                            <div
                                className={`mt-2 pl-3.5 border-l-2 space-y-3 ${
                                    isLight ? 'border-[#e2e2df]' : 'border-[#333333]'
                                }`}
                            >
                                {item.steps.map(step => renderSingleStepBody(step, isLight))}
                            </div>
                        )}
                    </div>
                );
            }

            if (item.kind === 'task_finished') {
                const isTaskOpen = !!expandedWorkGroups[item.id];
                return (
                    <div key={`${isLight ? 'desk' : 'mob'}_tf_${item.id}`} className="my-1">
                        <button
                            type="button"
                            onClick={() =>
                                setExpandedWorkGroups(prev => ({
                                    ...prev,
                                    [item.id]: !prev[item.id]
                                }))
                            }
                            className={`w-full px-2.5 py-1.5 -mx-2.5 rounded-lg flex items-center gap-1.5 text-[13.5px] transition-colors text-left ${
                                isLight
                                    ? isTaskOpen
                                        ? 'bg-[#efefed] text-[#4a4a4a]'
                                        : 'text-[#757575] hover:text-[#1f1f1f] hover:bg-[#efefed]'
                                    : isTaskOpen
                                    ? 'bg-white/[0.06] text-[#d4d4d4]'
                                    : 'text-[#9e9e9e] hover:text-[#e3e3e3] hover:bg-white/[0.04]'
                            }`}
                        >
                            <span>
                                {item.task.summary} {item.task.status || 'finished'}
                            </span>
                            {isTaskOpen ? (
                                <ChevronDown className="w-3.5 h-3.5 opacity-80" />
                            ) : (
                                <ChevronRight className="w-3.5 h-3.5 opacity-80" />
                            )}
                        </button>
                        {isTaskOpen && item.task.output && (
                            <div
                                className={`mt-1.5 px-3.5 py-2.5 rounded-xl border text-[12px] font-mono whitespace-pre-wrap max-h-60 overflow-y-auto ${
                                    isLight
                                        ? 'bg-[#1e1e1e] border-[#e0e0de] text-[#d4d4d4]'
                                        : 'bg-[#141414] border-[#2e2e2e] text-[#b0b0b0]'
                                }`}
                            >
                                {maskEmailsInText(item.task.output)}
                            </div>
                        )}
                    </div>
                );
            }

            return (
                <div key={`${isLight ? 'desk' : 'mob'}_a_${item.id}`}>
                    {renderSingleStepBody(item.msg, isLight)}
                </div>
            );
        })}
            </>
        );
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
                                    <span className="text-xs truncate max-w-[70px] mt-1">{att.name}</span>
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
                                            <div className="text-xs text-[#8e8e8e]">
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
                                <div className="text-xs mb-1 truncate opacity-80">{att.name}</div>
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

    // Render Desktop 2-Layer Composer Box (supports both Antigravity PC & ChatGPT PC styles)
    const renderDesktopComposer = () => (
        <div className="relative w-full">
            {slashMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl bg-white border border-[#dfdfd8] shadow-xl py-1.5 max-h-56 overflow-y-auto z-40">
                    <div className="px-3.5 py-1 text-xs font-medium uppercase tracking-wider text-[#787878]">
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
                    <div className="px-3.5 py-1 text-xs font-medium uppercase tracking-wider text-[#787878]">
                        {isChatGPT ? 'Chọn Dự án / Plugin ChatGPT PC' : 'Mention Project / Context'}
                    </div>
                    {effectiveProjects.map(p => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                                if (isChatGPT) {
                                    setChatgptTargetProjectId(p.id);
                                    setChatgptTargetProjectName(p.name);
                                } else {
                                    setTargetNewProjectId(p.id);
                                    setTargetNewProjectName(p.name);
                                }
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
                className={`rounded-[18px] bg-[#efefef] border transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)] ${
                    isDraggingMedia ? 'border-[#1967d2] ring-2 ring-[#1967d2]/20' : 'border-[#e3e3e0]'
                }`}
            >
                <div className="bg-white rounded-[17px] px-4 pt-3.5 pb-2.5 border-b border-[#e5e5e2]">
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
                        placeholder={
                            isChatGPT
                                ? chatgptSubTab === 'work'
                                    ? 'Làm việc với ChatGPT'
                                    : 'Nhắn tin cho ChatGPT'
                                : 'Ask anything, @ to mention, / for actions (Ctrl+V hoặc kéo thả ảnh/video/file)'
                        }
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

                            {isChatGPT ? (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setChatgptPermMode(prev =>
                                            prev === 'Toàn quyền tiếp cận'
                                                ? 'Hỏi trước khi thực thi'
                                                : 'Toàn quyền tiếp cận'
                                        )
                                    }
                                    className="flex items-center gap-1.5 py-1 px-2 rounded-md text-[12.5px] text-[#d97706] hover:bg-[#fef3c7]/60 transition-colors"
                                    title="Chế độ quyền thực thi Codex trên PC"
                                >
                                    <ShieldCheck className="w-[14px] h-[14px] text-[#d97706] shrink-0" />
                                    <span className="font-medium">{chatgptPermMode}</span>
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setModelMenuOpen(prev => !prev)}
                                    className="flex items-center gap-1.5 py-1 px-2 rounded-md hover:bg-black/[0.04] transition-colors truncate"
                                >
                                    <span className="text-[12.5px] text-[#3c3c3c] font-normal truncate">
                                        {effectiveSelectedModel.name}
                                    </span>
                                    {effectiveSelectedModel.tier && (
                                        <span className="text-[12.5px] text-[#8e8e8e] font-normal shrink-0">
                                            {effectiveSelectedModel.tier}
                                        </span>
                                    )}
                                    <ChevronDown className="w-3.5 h-3.5 text-[#8e8e8e] shrink-0" />
                                </button>
                            )}

                            {!isChatGPT && modelMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setModelMenuOpen(false)} />
                                    <div className="absolute left-6 bottom-full mb-2 w-72 rounded-xl bg-white border border-[#dfdfd8] shadow-xl py-1.5 z-40 max-h-72 overflow-y-auto">
                                        <div className="px-3.5 py-1 text-xs font-medium text-[#787878] flex items-center justify-between">
                                            <span>Model</span>
                                            <span>Quota</span>
                                        </div>
                                        {effectiveModels.map(m => {
                                            const isSelected = effectiveSelectedModel.id === m.id;
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
                                                            <span className="px-1.5 py-0.2 text-xs rounded bg-[#eef4ff] text-[#1967d2] font-medium">
                                                                {m.tag}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="text-xs text-[#787878]">{pct}%</span>
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
                            {isChatGPT ? (
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setModelMenuOpen(prev => !prev)}
                                        className="flex items-center gap-1.5 py-1 px-2 rounded-md hover:bg-black/[0.04] transition-colors truncate"
                                    >
                                        <span className="text-[12.5px] text-[#1f1f1f] font-medium truncate">
                                            {effectiveSelectedModel.name}
                                        </span>
                                        {effectiveSelectedModel.tier && (
                                            <span className="text-[12.5px] text-[#7c3aed] font-semibold shrink-0">
                                                {effectiveSelectedModel.tier}
                                            </span>
                                        )}
                                        <ChevronDown className="w-3.5 h-3.5 text-[#8e8e8e] shrink-0" />
                                    </button>

                                    {modelMenuOpen && (
                                        <>
                                            <div className="fixed inset-0 z-30" onClick={() => setModelMenuOpen(false)} />
                                            <div className="absolute right-0 bottom-full mb-2 w-72 rounded-xl bg-white border border-[#dfdfd8] shadow-xl py-1.5 z-40 max-h-72 overflow-y-auto">
                                                <div className="px-3.5 py-1 text-xs font-medium text-[#787878] flex items-center justify-between">
                                                    <span>ChatGPT / Codex Model</span>
                                                    <span>Tier</span>
                                                </div>
                                                {effectiveModels.map(m => {
                                                    const isSelected = effectiveSelectedModel.id === m.id;
                                                    return (
                                                        <button
                                                            key={m.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setChatgptSelectedModel(m);
                                                                setModelMenuOpen(false);
                                                            }}
                                                            className={`w-full px-3.5 py-2 flex items-center justify-between hover:bg-black/[0.04] text-left transition-colors ${
                                                                isSelected ? 'bg-black/[0.03]' : ''
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                <span className="text-[13px] text-[#1f1f1f] font-medium truncate">
                                                                    {m.name}
                                                                </span>
                                                                {m.tier && (
                                                                    <span className="text-[12.5px] text-[#7c3aed] font-semibold">
                                                                        {m.tier}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                {isSelected && <Check className="w-3.5 h-3.5 text-[#0066ff]" />}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : (
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
                                                            <div className="text-xs text-[#787878]">{mode.desc}</div>
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
                            )}

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
                                        isChatGPT
                                            ? promptText.trim() || attachedMedia.length > 0
                                                ? 'bg-[#0066ff] text-white shadow-sm'
                                                : 'bg-[#3b82f6] text-white opacity-90'
                                            : promptText.trim() || attachedMedia.length > 0
                                            ? 'bg-[#1f1f1f] text-white shadow-sm'
                                            : 'bg-[#e4e4e2] text-[#6e6e6e]'
                                    }`}
                                >
                                    {isChatGPT ? (
                                        <ArrowRight className="w-[15px] h-[15px] -rotate-90" />
                                    ) : (
                                        <ArrowRight className="w-[15px] h-[15px]" />
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="px-3.5 py-1.5 flex items-center justify-between text-[12px] text-[#5f6368] relative">
                    {isChatGPT ? (
                        <>
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setDesktopProjectMenuOpen(prev => !prev)}
                                        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-black/[0.04] text-[#3c3c3c] font-medium transition-colors"
                                    >
                                        <Folder className="w-[13.5px] h-[13.5px] text-[#5f6368]" />
                                        <span>{effectiveTargetProjectName}</span>
                                    </button>
                                    {desktopProjectMenuOpen && (
                                        <>
                                            <div
                                                className="fixed inset-0 z-30"
                                                onClick={() => setDesktopProjectMenuOpen(false)}
                                            />
                                            <div className="absolute left-0 bottom-full mb-1.5 w-64 rounded-xl bg-white border border-[#dfdfd8] shadow-xl py-1.5 z-40 max-h-64 overflow-y-auto">
                                                <div className="px-3 py-1 text-xs font-medium text-[#787878]">
                                                    Chọn Dự án ChatGPT PC
                                                </div>
                                                {effectiveProjects.map(p => (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setChatgptTargetProjectId(p.id);
                                                            setChatgptTargetProjectName(p.name);
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
                                                        {effectiveTargetProjectId === p.id && (
                                                            <Check className="w-3.5 h-3.5 text-[#0066ff] shrink-0" />
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-black/[0.04] text-[#3c3c3c] transition-colors"
                                >
                                    <FileCode className="w-[13.5px] h-[13.5px] text-[#5f6368]" />
                                    <span>Tệp</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setMentionMenuOpen(prev => !prev)}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-black/[0.04] text-[#3c3c3c] transition-colors"
                                >
                                    <span className="font-semibold text-[#5f6368]">@</span>
                                    <span>Plugin</span>
                                </button>
                            </div>

                            <div className="flex items-center gap-1.5 text-[#6e6e6e]" title="ChatGPT Desktop App (PC)">
                                <Laptop className="w-[14px] h-[14px]" />
                            </div>
                        </>
                    ) : (
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
                                                    <div className="text-xs text-[#787878]">{env.desc}</div>
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
                    )}
                </div>
            </div>
        </div>
    );

    // Memoize rendered message trees so typing in <textarea> (promptText) never re-parses or re-renders messages
    const renderedDesktopMessages = useMemo(() => {
        if (isMobileViewport || !activeConversation?.messages || activeConversation.messages.length === 0) {
            return null;
        }
        return renderGroupedConversationMessages(activeConversation.messages, true);
    }, [
        isMobileViewport,
        activeConversation?.id,
        activeConversation?.messages,
        expandedThinking,
        expandedTools,
        expandedWorkGroups,
        copiedCodeId,
        visibleGroupLimit
    ]);

    const renderedMobileMessages = useMemo(() => {
        if (!isMobileViewport || !activeConversation?.messages || activeConversation.messages.length === 0) {
            return null;
        }
        return renderGroupedConversationMessages(activeConversation.messages, false);
    }, [
        isMobileViewport,
        activeConversation?.id,
        activeConversation?.messages,
        expandedThinking,
        expandedTools,
        expandedWorkGroups,
        copiedCodeId,
        visibleGroupLimit
    ]);

    const isMobileFocusedMode =
        isMobileViewport && (isMobileComposerFocused || vvState.keyboardOpen || isMobileComposerExpanded);

    const handleQuickMobileCommand = (cmd: string) => {
        if (mobileBlurTimerRef.current) {
            clearTimeout(mobileBlurTimerRef.current);
            mobileBlurTimerRef.current = null;
        }
        setPromptText(prev => {
            const trimmed = prev.trimStart();
            if (trimmed.startsWith(`${cmd} `)) {
                return trimmed.slice(cmd.length + 1);
            }
            if (trimmed === cmd) {
                return '';
            }
            return prev ? `${cmd} ${prev}` : `${cmd} `;
        });
        setSlashMenuOpen(false);
        setMentionMenuOpen(false);
        setIsMobileComposerFocused(true);
        setTimeout(() => {
            mobileTextareaRef.current?.focus();
        }, 20);
    };

    return (
        <div
            style={
                isMobileViewport && vvState.height > 160
                    ? {
                          top: `${vvState.offsetTop}px`,
                          height: `${vvState.height}px`,
                          maxHeight: `${vvState.height}px`
                      }
                    : undefined
            }
            className={`w-full select-none font-sans flex flex-col overflow-hidden ${
                isMobileViewport
                    ? 'fixed left-0 right-0 z-[45] bg-[#1e1f1c] rounded-none border-0 shadow-none'
                    : 'flex-1 min-h-0 h-full md:h-[calc(100dvh-28px)] md:min-h-[420px] bg-[#1e1f1c] md:bg-transparent rounded-none md:rounded-2xl border-0 md:border md:border-[#e3e3e0] shadow-none md:shadow-xs relative'
            }`}
        >
            {!isSystemOwner ? (
                <div className="w-full h-full flex items-center justify-center p-6 bg-slate-950 text-white">
                    <div className="max-w-lg w-full rounded-2xl bg-slate-900 border border-rose-500/40 p-6 space-y-4 shadow-2xl">
                        <div className="flex items-center gap-3">
                            <img src="/icons/dopamine-3d/ui_shield_lead.png" alt="403 Forbidden" className="w-10 h-10 object-contain drop-shadow-sm shrink-0" />
                            <div>
                                <h3 className="text-base font-bold text-white">403 · Quyền Truy Cập Dành Riêng Cho Admin (Owner)</h3>
                                <p className="text-xs text-rose-400 font-semibold mt-0.5">
                                    Tính năng điều khiển trực tiếp máy chủ Host chỉ mở cho Admin hệ thống.
                                </p>
                            </div>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                            Để bảo vệ tuyệt đối dữ liệu cá nhân, thành viên vui lòng sử dụng bộ công cụ tự host <strong>Antigravity Mobile Companion v2.2</strong> tại mục 2.1 (Extension, Tool & Repo).
                        </p>
                        {onBackToPortal && (
                            <button
                                type="button"
                                onClick={onBackToPortal}
                                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
                            >
                                ← Quay về Cổng Thành Viên
                            </button>
                        )}
                    </div>
                </div>
            ) : (
            <>
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

            {/* TOP PROVIDER SWITCHER BAR (ANTIGRAVITY vs CHATGPT PC) — Hiển thị trên Desktop, ẩn trên Mobile để chuẩn giao diện antigravity.google.com */}
            <div className="hidden md:flex shrink-0 px-3 py-1.5 bg-[#f1f1ef] border-b border-[#e3e3e0] items-center justify-between gap-2 z-30">
                <div className="grid grid-cols-2 md:flex items-center gap-1.5 w-full md:w-auto">
                    <button
                        type="button"
                        onClick={() => handleSwitchProvider('antigravity')}
                        className={`justify-center px-3 py-1.5 md:py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                            !isChatGPT
                                ? 'bg-[#2a2a2a] text-white border border-[#444] md:bg-white md:text-[#111111] shadow-xs md:border-[#d8d8d4]'
                                : 'text-[#9e9e9e] hover:text-white md:text-[#5f6368] md:hover:text-[#1f1f1f] hover:bg-white/5 md:hover:bg-black/[0.04]'
                        }`}
                    >
                        <AntigravityRibbonLogo className="w-4 h-4 shrink-0" />
                        <span>ANTIGRAVITY</span>
                        <span
                            className={`px-1.5 py-0.2 rounded-full text-xs font-semibold tabular-nums ${
                                !isChatGPT
                                    ? 'bg-[#8ab4f8]/20 text-[#8ab4f8] md:bg-[#e8f0fe] md:text-[#1967d2]'
                                    : 'bg-white/10 text-[#9e9e9e] md:bg-black/[0.06] md:text-[#6e6e6e]'
                            }`}
                        >
                            {projects.reduce((acc, p) => acc + (p.totalCount || 0), 0)}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => handleSwitchProvider('chatgpt')}
                        className={`justify-center px-3 py-1.5 md:py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                            isChatGPT
                                ? 'bg-[#10a37f] text-white border border-[#10a37f] md:bg-[#111111] md:border-[#111111] shadow-xs'
                                : 'text-[#9e9e9e] hover:text-white md:text-[#5f6368] md:hover:text-[#1f1f1f] hover:bg-white/5 md:hover:bg-black/[0.04]'
                        }`}
                    >
                        <ChatGPTLogo className="w-3.5 h-3.5 shrink-0" />
                        <span>CHATGPT</span>
                        <span
                            className={`px-1.5 py-0.2 rounded-full text-xs font-semibold tabular-nums ${
                                isChatGPT
                                    ? 'bg-white/20 text-white'
                                    : 'bg-black/[0.06] text-[#6e6e6e]'
                            }`}
                        >
                            {chatgptProjects.reduce((acc, p) => acc + (p.totalCount || 0), 0)}
                        </span>
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    {isChatGPT &&
                        chatgptQuota &&
                        chatgptQuota.source !== 'unavailable' &&
                        chatgptQuota.fiveHour &&
                        chatgptQuota.weekly && (
                            <>
                                <div
                                    className="inline-flex lg:hidden items-center gap-1.5 px-2 py-0.5 rounded-full bg-white border border-[#d8d8d4] text-xs font-medium text-[#1f1f1f] tabular-nums"
                                    title={`Giới hạn trong 5 giờ: ${chatgptQuota.fiveHour.resetLabel || ''} · Giới hạn hằng tuần: ${chatgptQuota.weekly.resetLabel || ''}`}
                                >
                                    <span>
                                        5h: <strong>{chatgptQuota.fiveHour.remainingPercent}%</strong>
                                    </span>
                                    <span className="text-[#c4c4c0]">·</span>
                                    <span>
                                        Tuần: <strong>{chatgptQuota.weekly.remainingPercent}%</strong>
                                    </span>
                                </div>
                                <div
                                    className="hidden lg:inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white border border-[#d8d8d4] text-xs font-medium text-[#1f1f1f] tabular-nums"
                                    title={`Giới hạn trong 5 giờ: ${chatgptQuota.fiveHour.resetLabel || ''} · Giới hạn hằng tuần: ${chatgptQuota.weekly.resetLabel || ''}`}
                                >
                                    <span>
                                        5 giờ: <strong>Còn lại {chatgptQuota.fiveHour.remainingPercent}%</strong>
                                    </span>
                                    <span className="text-[#c4c4c0]">·</span>
                                    <span>
                                        Hằng tuần: <strong>Còn lại {chatgptQuota.weekly.remainingPercent}%</strong>
                                    </span>
                                    {chatgptQuota.source === 'stale' && (
                                        <span className="text-[#b06000] text-xs font-normal">(Bản đệm)</span>
                                    )}
                                </div>
                            </>
                        )}

                    <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-[#e6f4ea] text-[#137333]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#137333]" />
                        {isChatGPT ? 'Đồng bộ ChatGPT PC (.codex)' : 'Đồng bộ Antigravity PC'}
                    </span>
                </div>
            </div>

            {/* =========================================================================================
                A. DESKTOP WEB & PC APP LAYOUT (>= 768px / md:flex)
                   Exact match to Antigravity PC App & ChatGPT PC App
               ========================================================================================= */}
            {!isMobileViewport && (
            <div className="hidden md:flex w-full flex-1 min-h-0 bg-[#f9f9f8] text-[#1f1f1f] overflow-hidden">
                {/* 1. LEFT SIDEBAR (300px, clean hidden scrollbar, exact PC App controls) */}
                {desktopSidebarOpen && (
                    <aside className="w-[300px] h-full bg-[#f3f3f2] border-r border-[#e6e6e4] flex flex-col shrink-0 select-none">
                        {/* Top Header matching PC App: Antigravity [A Logo] or ChatGPT [ChatGPT v] */}
                        <div className="px-3.5 pt-3 pb-2 flex items-center justify-between gap-2">
                            {isChatGPT ? (
                                <button
                                    type="button"
                                    onClick={() => handleStartNewInProject()}
                                    title="ChatGPT PC Home"
                                    className="px-1.5 py-1 rounded-md hover:bg-black/[0.04] flex items-center gap-1.5 transition-colors"
                                >
                                    <ChatGPTLogo className="w-[17px] h-[17px] text-[#1f1f1f]" />
                                    <span className="text-[14px] font-semibold text-[#1f1f1f]">ChatGPT</span>
                                    <ChevronDown className="w-3.5 h-3.5 text-[#6e6e6e]" />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => handleStartNewInProject()}
                                    title="Antigravity Home"
                                    className="p-1 rounded-md hover:bg-black/[0.04] transition-colors"
                                >
                                    <AntigravityMonoLogo className="w-[18px] h-[18px]" />
                                </button>
                            )}

                            <div className="flex items-center gap-1.5">
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
                                        placeholder={isChatGPT ? 'Tìm cuộc trò chuyện ChatGPT...' : 'Search conversations...'}
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

                        {/* Primary Navigation Buttons */}
                        <div className="px-3 space-y-0.5">
                            <button
                                type="button"
                                onClick={() => handleStartNewInProject()}
                                className="w-full px-3 py-1.5 mb-1 rounded-[8px] bg-white hover:bg-[#fcfcfb] border border-[#e2e2df] shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex items-center gap-2 text-[13px] text-[#1f1f1f] font-normal transition-all"
                            >
                                <Plus className="w-[15px] h-[15px] text-[#4a4a4a]" />
                                <span>{isChatGPT ? 'Trò chuyện mới' : 'New Conversation'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setHistoryModalOpen(true)}
                                className="w-full px-2.5 py-1.5 rounded-[8px] hover:bg-black/[0.04] flex items-center gap-2.5 text-[13px] text-[#3c3c3c] font-normal transition-colors"
                            >
                                <History className="w-[15px] h-[15px] text-[#5f6368]" />
                                <span>{isChatGPT ? 'Lịch sử trò chuyện' : 'Conversation History'}</span>
                            </button>

                            {!isChatGPT && (
                                <>
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
                                        onClick={async () => {
                                            setCustomizationsModalOpen(true);
                                            if (!customData) {
                                                for (const base of getCompanionBaseUrls()) {
                                                    try {
                                                        const r = await fetch(`${base}/api/ag-companion/customizations`, {
                                                            headers: { Authorization: `Bearer ${safeAuthToken}` },
                                                            signal: AbortSignal.timeout(2500)
                                                        });
                                                        if (r.ok) {
                                                            const d = await r.json();
                                                            if (d && d.ok) {
                                                                setCustomData(d);
                                                                break;
                                                            }
                                                        }
                                                    } catch {}
                                                }
                                            }
                                        }}
                                        className="w-full px-2.5 py-1.5 rounded-[8px] hover:bg-black/[0.04] flex items-center gap-2.5 text-[13px] text-[#3c3c3c] font-normal transition-colors"
                                    >
                                        <Archive className="w-[15px] h-[15px] text-[#5f6368]" />
                                        <span>Customizations</span>
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Scrollable Pinned Conversations & Projects Tree */}
                        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                            {/* Pinned Conversations (Đã ghim) */}
                            {effectivePinnedConversations.length > 0 && (
                                <div>
                                    <div className="px-1.5 mb-1 text-xs text-[#787878] font-normal">
                                        {isChatGPT ? 'Đã ghim' : 'Pinned Conversations'}
                                    </div>
                                    <div className="space-y-0.5">
                                        {filterConvList(effectivePinnedConversations).map(conv => {
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
                                                        {!isChatGPT && (
                                                            <span className="text-xs text-[#787878] shrink-0">
                                                                {conv.relativeTime}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {!isChatGPT && (
                                                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#787878]">
                                                            <Folder className="w-3 h-3 text-[#8e8e8e] shrink-0" />
                                                            <span className="truncate">{conv.projectName}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Projects (Dự án) */}
                            <div>
                                <div className="px-1.5 mb-1 flex items-center justify-between">
                                    <span className="text-xs text-[#787878] font-normal">
                                        {isChatGPT ? 'Dự án' : 'Projects'}
                                    </span>
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
                                    {effectiveProjects.map(proj => {
                                        const isCollapsed = !!collapsedProjects[proj.id];
                                        const isExpandedAll = !!expandedSeeAllProjects[proj.id];
                                        const filteredConvs = filterConvList(proj.conversations);
                                        const defaultLimit = isChatGPT
                                            ? 5
                                            : proj.name === 'AG' || proj.id.startsWith('ag-pc-')
                                            ? 16
                                            : 4;
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
                                                    className={`group flex items-center justify-between px-1.5 py-1 rounded-[7px] hover:bg-black/[0.04] cursor-pointer transition-colors ${
                                                        isChatGPT && effectiveTargetProjectId === proj.id && !activeConversationId
                                                            ? 'bg-[#e8e8e6]'
                                                            : ''
                                                    }`}
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
                                                        {filteredConvs.length === 0 ? (
                                                            <div className="pl-6 pr-2 py-1 text-xs text-[#9e9e9e]">
                                                                Không có cuộc trò chuyện nào
                                                            </div>
                                                        ) : (
                                                            visibleConvs.map(conv => {
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
                                                                                !isChatGPT &&
                                                                                    conv.provider !== 'chatgpt' &&
                                                                                    conv.workspaceTag
                                                                                    ? `Claude giao · ${conv.workspaceTag} · ${conv.title}`
                                                                                    : conv.title
                                                                            )}
                                                                        </span>

                                                                        <div className="shrink-0 flex items-center justify-end min-w-[24px]">
                                                                            {conv.hasError ? (
                                                                                <AlertCircleRedIcon
                                                                                    className="w-[15px] h-[15px]"
                                                                                    title={conv.errorMessage || 'Bạn đã hết lượt sử dụng Codex và Công việc'}
                                                                                />
                                                                            ) : conv.isRunning && !isActive ? (
                                                                                <PcRunningArcSpinner className="w-[14px] h-[14px] text-[#5f6368]" />
                                                                            ) : conv.unread && !isActive ? (
                                                                                <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                                                                                    <span className="absolute inline-flex h-3 w-3 rounded-full bg-[#3b82f6]/20" />
                                                                                    <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-[#3b82f6]" />
                                                                                </span>
                                                                            ) : isChatGPT ? null : (
                                                                                <span className="text-xs text-[#787878] font-normal">
                                                                                    {conv.relativeTime}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        )}

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
                                                                {isChatGPT
                                                                    ? isExpandedAll
                                                                        ? 'Thu gọn'
                                                                        : 'Hiển thị thêm'
                                                                    : isExpandedAll
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
                                        {isChatGPT ? 'ChatGPT PC (.codex)' : hostName}
                                    </span>
                                </div>
                                <ChevronDown className="w-3.5 h-3.5 text-[#6e6e6e] shrink-0" />
                            </button>

                            {hostMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setHostMenuOpen(false)} />
                                    <div className="absolute left-2.5 right-2.5 bottom-20 rounded-xl bg-white border border-[#dfdfd8] shadow-xl py-1.5 z-40">
                                        <div className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-[#787878] flex items-center justify-between">
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
                                                        <div className="text-xs text-[#787878] truncate">
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
                                <span
                                    className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                        wsLiveConnected
                                            ? 'text-[#137333] bg-[#e6f4ea]'
                                            : 'text-[#b06000] bg-[#fef7e0]'
                                    }`}
                                >
                                    {wsLiveConnected ? '● Realtime WS' : '○ Syncing...'}
                                </span>
                            </div>
                        </div>
                    </aside>
                )}

                {/* 2. RIGHT MAIN CANVAS ON DESKTOP */}
                <main className="flex-1 h-full flex flex-col bg-[#f9f9f8] relative overflow-hidden">
                    {/* Top Header Bar of Right Canvas */}
                    <div className="h-[52px] px-4 flex items-center justify-between shrink-0 relative">
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
                                        <span>{isChatGPT ? 'Mới' : 'New'}</span>
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
                                        {activeConversation?.projectName || effectiveTargetProjectName}
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

                        {/* Center Segmented Pill Switcher matching ChatGPT PC (Trò chuyện | Công việc) */}
                        {isChatGPT && !activeConversationId && (
                            <div className="absolute left-1/2 -translate-x-1/2 flex items-center p-1 rounded-full bg-[#efefed] border border-[#e4e4e1]">
                                <button
                                    type="button"
                                    onClick={() => setChatgptSubTab('chat')}
                                    className={`px-4 py-1 rounded-full text-[12.5px] font-medium transition-all ${
                                        chatgptSubTab === 'chat'
                                            ? 'bg-white text-[#111111] shadow-xs'
                                            : 'text-[#6e6e6e] hover:text-[#1f1f1f]'
                                    }`}
                                >
                                    Trò chuyện
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setChatgptSubTab('work')}
                                    className={`px-4 py-1 rounded-full text-[12.5px] font-medium transition-all ${
                                        chatgptSubTab === 'work'
                                            ? 'bg-white text-[#111111] shadow-xs'
                                            : 'text-[#6e6e6e] hover:text-[#1f1f1f]'
                                    }`}
                                >
                                    Công việc
                                </button>
                            </div>
                        )}

                        {/* Top-Right Icons: Feedback (!) + User Avatar ('vu') with Google 4-color ring */}
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
                        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8 relative">
                            <div className="w-full max-w-[660px]">
                                {isChatGPT ? (
                                    <h2 className="text-[26px] font-semibold text-[#1f1f1f] text-center mb-6 tracking-tight">
                                        Chúng ta nên làm gì?
                                    </h2>
                                ) : (
                                    <div className="mb-2 flex items-center relative">
                                        <button
                                            type="button"
                                            onClick={() => setDesktopProjectMenuOpen(prev => !prev)}
                                            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[13px] text-[#5f6368] hover:text-[#1f1f1f] hover:bg-black/[0.04] transition-colors"
                                        >
                                            <Folder className="w-[15px] h-[15px] text-[#787878]" />
                                            <span>{effectiveTargetProjectName}</span>
                                            <ChevronDown className="w-3.5 h-3.5 text-[#787878]" />
                                        </button>

                                        {desktopProjectMenuOpen && (
                                            <>
                                                <div
                                                    className="fixed inset-0 z-30"
                                                    onClick={() => setDesktopProjectMenuOpen(false)}
                                                />
                                                <div className="absolute left-0 top-full mt-1 w-64 rounded-xl bg-white border border-[#dfdfd8] shadow-xl py-1.5 z-40 max-h-64 overflow-y-auto">
                                                    <div className="px-3 py-1 text-xs font-medium text-[#787878]">
                                                        Select Workspace Project
                                                    </div>
                                                    {effectiveProjects.map(p => (
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
                                                            {effectiveTargetProjectId === p.id && (
                                                                <Check className="w-3.5 h-3.5 text-[#1967d2] shrink-0" />
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {!isSystemOwner && (
                                    <div className="mb-4 p-4 rounded-2xl bg-emerald-50/90 border border-emerald-200 text-slate-800 shadow-xs space-y-2.5">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <img src="/icons/dopamine-3d/ui_shield_lead.png" alt="" className="w-5 h-5 object-contain drop-shadow-sm shrink-0" />
                                                <span className="text-xs font-extrabold text-emerald-900">
                                                    Bảo mật Dữ liệu MCP: Không đồng bộ hội thoại PC lên aihot.vn
                                                </span>
                                            </div>
                                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-600 text-white">
                                                Zero-Data-Leak
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-600 leading-relaxed">
                                            Để bảo vệ tuyệt đối mã nguồn và nội dung công việc của các thành viên, <strong>aihot.vn chỉ đồng bộ số lượng Token Đua Top</strong> và không thu thập lịch sử hội thoại từ máy PC của bạn. Bạn có thể <strong>Chat AI trực tiếp qua Cloud Gateway</strong> ngay bên dưới, hoặc tự cài 1-Click <strong>Antigravity Mobile Companion</strong> trên máy PC cá nhân để điều khiển qua điện thoại (LAN / 4G / 5G):
                                        </p>
                                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    navigator.clipboard?.writeText('irm https://raw.githubusercontent.com/vudanhdu2/antigravity-mobile-companion/main/install-and-run.ps1 | iex');
                                                    onToast?.('Đã sao chép lệnh cài 1-Click Self-Host Antigravity Mobile Companion!', 'success');
                                                }}
                                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer"
                                            >
                                                <img src="/icons/dopamine-3d/quest_rocket.png" alt="" className="w-4 h-4 object-contain drop-shadow-sm shrink-0" />
                                                <span>Copy lệnh Self-Host 1-Click (PowerShell)</span>
                                            </button>
                                            <a
                                                href="https://github.com/vudanhdu2/antigravity-mobile-companion"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition-all"
                                            >
                                                <img src="/icons/dopamine-3d/menu_2_1_repos.png" alt="" className="w-4 h-4 object-contain drop-shadow-sm shrink-0" />
                                                <span>Mở GitHub Repo Hướng dẫn</span>
                                            </a>
                                        </div>
                                    </div>
                                )}

                                {renderDesktopComposer()}
                            </div>

                            {/* ChatGPT PC Live Quota / Usage Card at bottom of Main Canvas */}
                            {isChatGPT &&
                                (chatgptQuotaAlert?.active ? (
                                    <div className="w-full max-w-[620px] mt-10 rounded-2xl bg-white border border-[#e4e4e1] shadow-[0_2px_10px_rgba(0,0,0,0.03)] px-5 py-3.5 flex items-center justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="text-[13px] font-semibold text-[#1f1f1f]">
                                                {chatgptQuotaAlert.title}
                                            </div>
                                            <div className="text-[12px] text-[#6e6e6e] mt-0.5 leading-snug">
                                                {chatgptQuotaAlert.subtitle}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <a
                                                href="https://chatgpt.com/#settings/Subscription"
                                                target="_blank"
                                                rel="noreferrer"
                                                className="px-3 py-1.5 rounded-full border border-[#d8d8d4] text-[12px] font-medium text-[#1f1f1f] hover:bg-black/[0.03] transition-colors"
                                            >
                                                Thêm credit
                                            </a>
                                            <a
                                                href="https://chatgpt.com/#pricing"
                                                target="_blank"
                                                rel="noreferrer"
                                                className="px-3.5 py-1.5 rounded-full bg-[#e8f0fe] hover:bg-[#d2e3fc] text-[#1967d2] text-[12px] font-medium flex items-center gap-1 transition-colors"
                                            >
                                                <Sparkles className="w-3.5 h-3.5" />
                                                <span>Nâng cấp</span>
                                            </a>
                                        </div>
                                    </div>
                                ) : chatgptQuota &&
                                  chatgptQuota.source !== 'unavailable' &&
                                  chatgptQuota.fiveHour &&
                                  chatgptQuota.weekly ? (
                                    <div className="w-full max-w-[620px] mt-8 rounded-2xl bg-white border border-[#e4e4e1] shadow-[0_2px_10px_rgba(0,0,0,0.03)] px-5 py-4 space-y-3.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <div>
                                                <div className="text-[13px] font-semibold text-[#1f1f1f]">
                                                    Giới hạn gói (Codex & Công việc)
                                                </div>
                                                <div className="text-[12px] text-[#6e6e6e]">
                                                    Đồng bộ trực tiếp từ Sử dụng & thanh toán trên ChatGPT PC
                                                </div>
                                            </div>
                                            <span
                                                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold tabular-nums ${
                                                    chatgptQuota.source === 'stale'
                                                        ? 'bg-[#fef7e0] text-[#b06000]'
                                                        : 'bg-[#e6f4ea] text-[#137333]'
                                                }`}
                                            >
                                                {chatgptQuota.source === 'stale' ? 'Bản đệm gần nhất' : 'Đang còn hạn mức'}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-0.5">
                                            <div className="space-y-1.5">
                                                <div className="text-[12.5px] font-semibold text-[#1f1f1f]">
                                                    Giới hạn trong 5 giờ
                                                </div>
                                                <div className="flex items-center justify-between text-xs text-[#6e6e6e] tabular-nums">
                                                    <span>{chatgptQuota.fiveHour.resetLabel}</span>
                                                    <span className="font-semibold text-[#1f1f1f]">
                                                        Còn lại {chatgptQuota.fiveHour.remainingPercent}%
                                                    </span>
                                                </div>
                                                <div className="w-full h-1.5 rounded-full bg-[#e6e6e3] overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-[#111111] transition-all"
                                                        style={{
                                                            width: `${Math.max(0, Math.min(100, chatgptQuota.fiveHour.remainingPercent))}%`
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <div className="text-[12.5px] font-semibold text-[#1f1f1f]">
                                                    Giới hạn hằng tuần
                                                </div>
                                                <div className="flex items-center justify-between text-xs text-[#6e6e6e] tabular-nums">
                                                    <span>{chatgptQuota.weekly.resetLabel}</span>
                                                    <span className="font-semibold text-[#1f1f1f]">
                                                        Còn lại {chatgptQuota.weekly.remainingPercent}%
                                                    </span>
                                                </div>
                                                <div className="w-full h-1.5 rounded-full bg-[#e6e6e3] overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-[#111111] transition-all"
                                                        style={{
                                                            width: `${Math.max(0, Math.min(100, chatgptQuota.weekly.remainingPercent))}%`
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full max-w-[620px] mt-8 rounded-2xl bg-white border border-[#e4e4e1] shadow-[0_2px_10px_rgba(0,0,0,0.03)] px-5 py-3.5 flex items-center justify-between gap-3">
                                        <div className="text-xs text-[#6e6e6e]">
                                            {chatgptQuota?.source === 'unavailable'
                                                ? 'Chưa đọc được hạn mức trực tiếp từ ChatGPT PC (vui lòng bấm Làm mới).'
                                                : 'Đang đồng bộ hạn mức trực tiếp từ Sử dụng & thanh toán trên ChatGPT PC...'}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                            <div ref={desktopScrollContainerRef} className="flex-1 overflow-y-auto px-6 py-4">
                                <div className="max-w-[740px] mx-auto space-y-5 pb-6">
                                    {isLoadingConversation && !activeConversation ? (
                                        <div className="py-20 flex flex-col items-center justify-center gap-2.5 text-[#787878]">
                                            <Loader2 className="w-6 h-6 animate-spin text-[#1967d2]" />
                                            <span className="text-[13.5px]">Loading conversation trajectory...</span>
                                        </div>
                                    ) : activeConversation?.messages && activeConversation.messages.length > 0 ? (
                                        renderedDesktopMessages
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
            )}

            {/* =========================================================================================
                B. MOBILE LAYOUT (< 768px / flex md:hidden)
                   Exact match to antigravity.google.com Mobile & ChatGPT PC Mobile Companion
               ========================================================================================= */}
            {isMobileViewport && (
            <div className="flex md:hidden flex-col w-full flex-1 min-h-0 bg-[#1e1f1c] text-[#e3e3e3] overflow-hidden relative">
                {/* 1. MOBILE TOP NAVIGATION BAR (Exact match to antigravity.google.com 52px Top Bar) */}
                {!activeConversationId ? (
                    <header className="h-[52px] px-3.5 bg-[#1e1f1c] border-b border-[#2c2d2a] flex items-center justify-between gap-2 shrink-0 z-20">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <button
                                type="button"
                                onClick={() => {
                                    if (onOpenMobileMenu) {
                                        onOpenMobileMenu();
                                    } else if (onBackToPortal) {
                                        onBackToPortal();
                                    }
                                }}
                                title={isChatGPT ? 'Mở Menu AIHOT.VN' : 'Mở Menu AIHOT.VN'}
                                className="p-0.5 rounded-lg hover:bg-white/5 active:scale-95 transition-all shrink-0"
                            >
                                {isChatGPT ? (
                                    <ChatGPTLogo className="w-[22px] h-[22px] text-white" />
                                ) : (
                                    <AntigravityRibbonLogo className="w-[24px] h-[24px]" />
                                )}
                            </button>

                            <div className="relative min-w-0 flex-1 max-w-[188px]">
                                <button
                                    type="button"
                                    onClick={() => setHostMenuOpen(prev => !prev)}
                                    className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-[10px] bg-[#252624] hover:bg-[#2c2d2a] border border-[#3a3b38] transition-colors min-w-0"
                                >
                                    <span className="flex items-center gap-2 min-w-0">
                                        <span
                                            className={`w-2 h-2 rounded-full shrink-0 ${
                                                wsLiveConnected ? 'bg-[#689f38]' : 'bg-[#fbbc04]'
                                            }`}
                                        />
                                        <span className="text-[13.5px] text-[#e3e3e3] truncate font-normal tracking-tight">
                                            {isChatGPT ? 'ChatGPT PC (.codex)' : hostName}
                                        </span>
                                    </span>
                                    <ChevronDown className="w-3.5 h-3.5 text-[#9e9e9e] shrink-0" />
                                </button>

                                {hostMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-30" onClick={() => setHostMenuOpen(false)} />
                                        <div className="absolute left-0 mt-1.5 w-64 rounded-xl bg-[#252624] border border-[#3a3b38] shadow-2xl py-1.5 z-40">
                                            <div className="px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-[#8e8e8e]">
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
                                                        <span className="w-2 h-2 rounded-full bg-[#689f38] shrink-0" />
                                                        <div className="truncate">
                                                            <div className="text-[13.5px] text-[#e3e3e3] truncate">
                                                                {inst.name}
                                                            </div>
                                                            <div className="text-xs text-[#8e8e8e] truncate">
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

                        <div className="flex items-center gap-1 shrink-0">
                            <button
                                type="button"
                                onClick={() => setSearchBarOpen(prev => !prev)}
                                title="Tìm kiếm hội thoại"
                                className={`p-1.5 rounded-full transition-colors ${
                                    searchBarOpen
                                        ? 'text-[#8ab4f8] bg-[#8ab4f8]/15'
                                        : 'text-[#9e9e9e] hover:text-[#e3e3e3] hover:bg-white/5'
                                }`}
                            >
                                <Search className="w-[18px] h-[18px]" />
                            </button>

                            <button
                                type="button"
                                onClick={() => setSettingsModalOpen(true)}
                                title={isChatGPT ? 'Cài đặt ChatGPT PC' : 'Cài đặt Antigravity'}
                                className="p-1.5 rounded-full text-[#9e9e9e] hover:text-[#e3e3e3] hover:bg-white/5 transition-colors"
                            >
                                <Settings className="w-[18px] h-[18px]" />
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    fetchOverview(false);
                                }}
                                title="Làm mới dữ liệu phiên"
                                className="p-1.5 rounded-full text-[#9e9e9e] hover:text-[#e3e3e3] hover:bg-white/5 transition-colors"
                            >
                                <RefreshCw
                                    className={`w-[18px] h-[18px] ${isRefreshing ? 'animate-spin text-[#8ab4f8]' : ''}`}
                                />
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    if (onOpenMobileMenu) {
                                        onOpenMobileMenu();
                                    } else if (onBackToPortal) {
                                        onBackToPortal();
                                    }
                                }}
                                title="Mở Menu Cổng Thành Viên AIHOT.VN"
                                className="p-1.5 rounded-full text-[#9e9e9e] hover:text-[#e3e3e3] hover:bg-white/5 transition-colors"
                            >
                                <MessageSquareWarning className="w-[18px] h-[18px]" />
                            </button>

                            <button
                                type="button"
                                onClick={() => setSettingsModalOpen(true)}
                                className="ml-0.5 p-[2px] rounded-full bg-gradient-to-tr from-[#4285F4] via-[#34A853] to-[#FBBC05] shrink-0 active:scale-95 transition-transform"
                                title={`Tài khoản: ${member.username}`}
                            >
                                <div className="w-7 h-7 rounded-full bg-[#689f38] text-white text-[13px] font-medium flex items-center justify-center tracking-tight">
                                    {(member.username || 'd').slice(0, 1).toLowerCase()}
                                </div>
                            </button>
                        </div>
                    </header>
                ) : (
                    /* Active Conversation 52px Top Bar matching antigravity.google.com */
                    <header className="h-[52px] px-3.5 bg-[#1e1f1c] border-b border-[#2c2d2a] flex items-center justify-between gap-2 shrink-0 z-20">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            <button
                                type="button"
                                onClick={() => {
                                    navigateToConversation(null, true);
                                    fetchOverview(true);
                                }}
                                title="Quay lại danh sách dự án"
                                className="p-1.5 -ml-1.5 rounded-full text-[#9e9e9e] hover:text-white hover:bg-white/5 transition-colors shrink-0"
                            >
                                <ArrowLeft className="w-[19px] h-[19px]" />
                            </button>

                            <div className="min-w-0 flex-1">
                                <div className="text-[15.5px] font-normal text-[#b8b8b8] truncate">
                                    {maskEmailsInText(activeConversation?.title || 'Đang tải hội thoại...')}
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
                                    title={activeConversation.pinned ? 'Bỏ ghim hội thoại' : 'Ghim hội thoại'}
                                    className={`p-1.5 rounded-full transition-colors ${
                                        activeConversation.pinned
                                            ? 'text-[#8ab4f8] bg-[#8ab4f8]/15'
                                            : 'text-[#9e9e9e] hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    <MoreVertical className="w-[18px] h-[18px]" />
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={() => {
                                    if (activeConversationId) {
                                        fetchConversationDetail(activeConversationId, false);
                                    }
                                }}
                                title="Làm mới nội dung hội thoại"
                                className="p-1.5 rounded-full text-[#9e9e9e] hover:text-white hover:bg-white/5 transition-colors"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.9"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className={`w-[18px] h-[18px] ${isLoadingConversation ? 'text-[#8ab4f8] animate-pulse' : ''}`}
                                >
                                    <rect x="3" y="4" width="18" height="16" rx="2" />
                                    <line x1="3" y1="14" x2="21" y2="14" />
                                </svg>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    if (onOpenMobileMenu) {
                                        onOpenMobileMenu();
                                    } else if (onBackToPortal) {
                                        onBackToPortal();
                                    }
                                }}
                                title="Mở Menu Cổng Thành Viên AIHOT.VN"
                                className="p-1.5 rounded-full text-[#9e9e9e] hover:text-white hover:bg-white/5 transition-colors"
                            >
                                <MessageSquareWarning className="w-[18px] h-[18px]" />
                            </button>

                            <button
                                type="button"
                                onClick={() => setSettingsModalOpen(true)}
                                className="ml-0.5 p-[2px] rounded-full bg-gradient-to-tr from-[#4285F4] via-[#34A853] to-[#FBBC05] shrink-0 active:scale-95 transition-transform"
                                title={`Tài khoản: ${member.username}`}
                            >
                                <div className="w-7 h-7 rounded-full bg-[#689f38] text-white text-[13px] font-medium flex items-center justify-center tracking-tight">
                                    {(member.username || 'd').slice(0, 1).toLowerCase()}
                                </div>
                            </button>
                        </div>
                    </header>
                )}

                {searchBarOpen && !activeConversationId && (
                    <div className="px-3.5 py-2 bg-[#1e1f1c] border-b border-[#2c2d2a] shrink-0">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#252624] border border-[#3a3b38]">
                            <Search className="w-4 h-4 text-[#8e8e8e] shrink-0" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder={isChatGPT ? 'Tìm cuộc trò chuyện ChatGPT...' : 'Search conversations...'}
                                className="w-full bg-transparent text-[16px] text-[#e3e3e3] placeholder-[#8e8e8e] outline-none"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="text-[#8e8e8e] hover:text-white p-0.5"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* 2. MOBILE MAIN CONTENT */}
                {!activeConversationId ? (
                    <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-4 space-y-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        {/* Customizations Row (matching antigravity.google.com) + Provider Switcher Pill */}
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                            <button
                                type="button"
                                onClick={async () => {
                                    setCustomizationsModalOpen(true);
                                    if (!customData) {
                                        for (const base of getCompanionBaseUrls()) {
                                            try {
                                                const r = await fetch(`${base}/api/ag-companion/customizations`, {
                                                    headers: { Authorization: `Bearer ${safeAuthToken}` },
                                                    signal: AbortSignal.timeout(2500)
                                                });
                                                if (r.ok) {
                                                    const d = await r.json();
                                                    if (d && d.ok) {
                                                        setCustomData(d);
                                                        break;
                                                    }
                                                }
                                            } catch {}
                                        }
                                    }
                                }}
                                className="flex items-center gap-2.5 py-1.5 text-[15.5px] text-[#b8b8b8] hover:text-[#e3e3e3] transition-colors"
                            >
                                <Archive className="w-[18px] h-[18px] text-[#9e9e9e] shrink-0" />
                                <span>Customizations</span>
                            </button>

                            <div className="flex items-center gap-1.5 shrink-0">
                                <div className="inline-flex items-center p-0.5 rounded-lg bg-[#252624] border border-[#3a3b38]">
                                    <button
                                        type="button"
                                        onClick={() => handleSwitchProvider('antigravity')}
                                        className={`px-2 py-0.5 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
                                            !isChatGPT ? 'bg-[#363734] text-[#e3e3e3]' : 'text-[#8e8e8e]'
                                        }`}
                                    >
                                        <AntigravityRibbonLogo className="w-3 h-3" />
                                        <span>Antigravity</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSwitchProvider('chatgpt')}
                                        className={`px-2 py-0.5 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
                                            isChatGPT ? 'bg-[#10a37f] text-white' : 'text-[#8e8e8e]'
                                        }`}
                                    >
                                        <ChatGPTLogo className="w-3 h-3" />
                                        <span>ChatGPT</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                        {!isSystemOwner && (
                            <div className="p-3.5 rounded-2xl bg-[#1a2e26] border border-emerald-500/40 text-[#e3e3e3] space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-extrabold text-emerald-300 inline-flex items-center gap-1.5">
                                        <img src="/icons/dopamine-3d/ui_shield_lead.png" alt="" className="w-4 h-4 object-contain drop-shadow-sm shrink-0" />
                                        <span>Zero-Data-Leak · Không đồng bộ hội thoại PC</span>
                                    </span>
                                </div>
                                <p className="text-xs text-[#b8cfc6] leading-relaxed">
                                    Để bảo mật dữ liệu, aihot.vn không đồng bộ hội thoại từ PC của bạn lên server. Bạn có thể chat trực tiếp qua Cloud Gateway ở ô nhập bên dưới, hoặc tự cài 1-Click <strong>Antigravity Mobile Companion</strong> trên PC cá nhân để điều khiển từ xa.
                                </p>
                                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard?.writeText('irm https://raw.githubusercontent.com/vudanhdu2/antigravity-mobile-companion/main/install-and-run.ps1 | iex');
                                            onToast?.('Đã sao chép lệnh Self-Host 1-Click!', 'success');
                                        }}
                                        className="px-2.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5"
                                    >
                                        <img src="/icons/dopamine-3d/quest_rocket.png" alt="" className="w-3.5 h-3.5 object-contain drop-shadow-sm shrink-0" />
                                        <span>Copy lệnh Self-Host</span>
                                    </button>
                                    <a
                                        href="https://github.com/vudanhdu2/antigravity-mobile-companion"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-2.5 py-1.5 rounded-xl bg-white/10 text-emerald-200 text-xs font-bold inline-flex items-center gap-1.5"
                                    >
                                        <span>GitHub Repo</span>
                                    </a>
                                </div>
                            </div>
                        )}

                        {isChatGPT && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="inline-flex items-center p-1 rounded-full bg-[#242424] border border-[#383838]">
                                        <button
                                            type="button"
                                            onClick={() => setChatgptSubTab('chat')}
                                            className={`px-3.5 py-1 rounded-full text-xs font-medium transition-all ${
                                                chatgptSubTab === 'chat'
                                                    ? 'bg-white text-[#111111] shadow-xs'
                                                    : 'text-[#a0a0a0] hover:text-white'
                                            }`}
                                        >
                                            Trò chuyện
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setChatgptSubTab('work')}
                                            className={`px-3.5 py-1 rounded-full text-xs font-medium transition-all ${
                                                chatgptSubTab === 'work'
                                                    ? 'bg-white text-[#111111] shadow-xs'
                                                    : 'text-[#a0a0a0] hover:text-white'
                                            }`}
                                        >
                                            Công việc
                                        </button>
                                    </div>
                                    <span className="text-xs text-[#9e9e9e]">ChatGPT PC (.codex)</span>
                                </div>

                                {chatgptQuotaAlert?.active ? (
                                    <div className="p-3.5 rounded-2xl bg-[#222222] border border-[#3a3a3a] flex flex-col gap-2">
                                        <div className="text-xs font-semibold text-white">
                                            {chatgptQuotaAlert.title}
                                        </div>
                                        <div className="text-xs text-[#a0a0a0] leading-snug">
                                            {chatgptQuotaAlert.subtitle}
                                        </div>
                                    </div>
                                ) : chatgptQuota &&
                                  chatgptQuota.source !== 'unavailable' &&
                                  chatgptQuota.fiveHour &&
                                  chatgptQuota.weekly ? (
                                    <div className="p-3.5 rounded-2xl bg-[#222222] border border-[#383838] space-y-2.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs font-semibold text-white">
                                                Giới hạn gói (Codex & Công việc)
                                            </span>
                                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold tabular-nums">
                                                {chatgptQuota.source === 'stale' ? 'Bản đệm' : 'Đang còn hạn mức'}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between text-xs text-[#b0b0b0] tabular-nums">
                                                    <span>5 giờ</span>
                                                    <strong className="text-white">
                                                        Còn {chatgptQuota.fiveHour.remainingPercent}%
                                                    </strong>
                                                </div>
                                                <div className="w-full h-1.5 rounded-full bg-[#383838] overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-emerald-400 transition-all"
                                                        style={{
                                                            width: `${Math.max(0, Math.min(100, chatgptQuota.fiveHour.remainingPercent))}%`
                                                        }}
                                                    />
                                                </div>
                                                <div className="text-xs text-[#8e8e8e] truncate">
                                                    {chatgptQuota.fiveHour.resetLabel}
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between text-xs text-[#b0b0b0] tabular-nums">
                                                    <span>Hằng tuần</span>
                                                    <strong className="text-white">
                                                        Còn {chatgptQuota.weekly.remainingPercent}%
                                                    </strong>
                                                </div>
                                                <div className="w-full h-1.5 rounded-full bg-[#383838] overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-emerald-400 transition-all"
                                                        style={{
                                                            width: `${Math.max(0, Math.min(100, chatgptQuota.weekly.remainingPercent))}%`
                                                        }}
                                                    />
                                                </div>
                                                <div className="text-xs text-[#8e8e8e] truncate">
                                                    {chatgptQuota.weekly.resetLabel}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        )}

                        {effectiveTargetProjectName && (isChatGPT || effectiveTargetProjectName !== defaultProjectName) && !isMobileFocusedMode && (
                            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#242424] border border-[#383838] text-[12.5px] text-[#b0b0b0]">
                                <span className="flex items-center gap-1.5">
                                    <Folder className="w-3.5 h-3.5 text-[#8ab4f8]" />
                                    {isChatGPT ? 'Dự án ChatGPT đang chọn:' : 'Đang chọn dự án mới:'}{' '}
                                    <strong className="text-white">{effectiveTargetProjectName}</strong>
                                </span>
                                {!isChatGPT && effectiveTargetProjectName !== defaultProjectName && (
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
                                )}
                            </div>
                        )}

                        {effectivePinnedConversations.length > 0 && (
                            <section>
                                <button
                                    type="button"
                                    onClick={() => setPinnedSectionOpen(prev => !prev)}
                                    className="flex items-center gap-1.5 text-[13.5px] text-[#9e9e9e] hover:text-[#e3e3e3] py-1.5 transition-colors"
                                >
                                    <span>{isChatGPT ? 'Đã ghim' : 'Pinned Conversations'}</span>
                                    <ChevronDown
                                        className={`w-3.5 h-3.5 transition-transform ${
                                            pinnedSectionOpen ? '' : '-rotate-90'
                                        }`}
                                    />
                                </button>

                                {pinnedSectionOpen && (
                                    <div className="mt-1 space-y-1">
                                        {filterConvList(effectivePinnedConversations).map(conv => (
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
                                    <span>{isChatGPT ? 'Dự án' : 'Projects'}</span>
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
                                    {isLoadingOverview && effectiveProjects.length === 0 ? (
                                        <div className="py-12 flex flex-col items-center justify-center gap-2 text-[#8e8e8e]">
                                            <Loader2 className="w-6 h-6 animate-spin text-[#8ab4f8]" />
                                            <span className="text-[13.5px]">
                                                Đang đồng bộ dự án từ {isChatGPT ? 'ChatGPT PC (.codex)' : hostName}...
                                            </span>
                                        </div>
                                    ) : (
                                        effectiveProjects.map(proj => {
                                            const isCollapsed = !!collapsedProjects[proj.id];
                                            const isExpandedAll = !!expandedSeeAllProjects[proj.id];
                                            const filteredConvs = filterConvList(proj.conversations);
                                            const defaultLimit = isChatGPT
                                                ? 5
                                                : proj.name === 'AG' || proj.id.startsWith('ag-pc-')
                                                ? 8
                                                : 3;
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
                                                            {filteredConvs.length === 0 ? (
                                                                <div className="py-1.5 text-[13.5px] text-[#787878]">
                                                                    Không có cuộc trò chuyện nào
                                                                </div>
                                                            ) : (
                                                                visibleConvs.map(conv => (
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
                                                                                !isChatGPT &&
                                                                                    conv.provider !== 'chatgpt' &&
                                                                                    conv.workspaceTag
                                                                                    ? `Claude giao · ${conv.workspaceTag} · ${conv.title}`
                                                                                    : conv.title
                                                                            )}
                                                                        </span>

                                                                        <div className="shrink-0 flex items-center justify-end min-w-[28px]">
                                                                            {conv.hasError ? (
                                                                                <AlertCircleRedIcon
                                                                                    className="w-4 h-4"
                                                                                    title={conv.errorMessage || 'Lỗi hạn mức lượt chạy'}
                                                                                />
                                                                            ) : conv.isRunning ? (
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
                                                                ))
                                                            )}

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
                                                                    {isChatGPT
                                                                        ? isExpandedAll
                                                                            ? 'Thu gọn'
                                                                            : 'Hiển thị thêm'
                                                                        : isExpandedAll
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
                    /* MOBILE ACTIVE CONVERSATION VIEW (Exact match to antigravity.google.com) */
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative bg-[#1e1f1c]">
                        <div
                            ref={mobileScrollContainerRef}
                            onScroll={e => {
                                const el = e.currentTarget;
                                const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
                                setShowMobileScrollDownBtn(dist > 60);
                            }}
                            className="flex-1 min-h-0 overflow-y-auto px-3.5 pt-3 pb-4 space-y-3.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                        >
                            {isLoadingConversation && !activeConversation ? (
                                <div className="py-16 flex flex-col items-center justify-center gap-2.5 text-[#8e8e8e]">
                                    <Loader2 className="w-6 h-6 animate-spin text-[#8ab4f8]" />
                                    <span className="text-[13.5px]">Đang tải nội dung phiên làm việc...</span>
                                </div>
                            ) : activeConversation?.messages && activeConversation.messages.length > 0 ? (
                                renderedMobileMessages
                            ) : (
                                <div className="py-12 text-center text-[14px] text-[#8e8e8e]">
                                    Chưa có bước hiển thị trong phiên này. Hãy gửi yêu cầu bên dưới để tiếp tục.
                                </div>
                            )}
                            <div ref={mobileMessagesEndRef} />
                        </div>

                        {/* Floating Scroll-to-Bottom Button (matching antigravity.google.com) */}
                        {(showMobileScrollDownBtn || (isMobileFocusedMode && (activeConversation?.messages?.length || 0) > 2)) && (
                            <button
                                type="button"
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => {
                                    scrollMessagesToBottom(true);
                                    setShowMobileScrollDownBtn(false);
                                }}
                                title="Cuộn xuống cuối hội thoại"
                                className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-30 w-9 h-9 rounded-full bg-[#2c2d2a]/95 hover:bg-[#383936] border border-[#3e3f3c] text-[#e3e3e3] shadow-[0_4px_14px_rgba(0,0,0,0.5)] flex items-center justify-center transition-all active:scale-95"
                            >
                                <ArrowDown className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                )}

                {/* 3. MOBILE BOTTOM PROMPT BOX (Exact 2-row antigravity.google.com rounded card docked above address bar / keyboard) */}
                <div className="shrink-0 px-3 pt-1.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] bg-[#1e1f1c] z-20 relative">
                    {/* SLASH COMMANDS POPOVER ON MOBILE */}
                    {slashMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-30" onClick={() => setSlashMenuOpen(false)} />
                            <div className="absolute left-3 right-3 bottom-full mb-2 rounded-2xl bg-[#252624] border border-[#3a3b38] shadow-2xl py-1.5 z-40 max-h-52 overflow-y-auto">
                                <div className="px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-[#8e8e8e] flex items-center justify-between">
                                    <span>Actions (/)</span>
                                    <button
                                        type="button"
                                        onClick={() => setSlashMenuOpen(false)}
                                        className="text-[#8e8e8e] hover:text-white p-0.5"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                {SLASH_COMMANDS.map(item => (
                                    <button
                                        key={`mob_slash_${item.cmd}`}
                                        type="button"
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={() => {
                                            handleQuickMobileCommand(item.cmd);
                                        }}
                                        className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-white/5 active:bg-white/10 text-left transition-colors gap-2"
                                    >
                                        <span className="text-xs font-mono text-[#8ab4f8] font-bold shrink-0">
                                            {item.cmd}
                                        </span>
                                        <span className="text-xs text-[#b8b8b8] truncate">{item.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    {/* MENTION / PROJECT TARGET POPOVER ON MOBILE */}
                    {mentionMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-30" onClick={() => setMentionMenuOpen(false)} />
                            <div className="absolute left-3 right-3 bottom-full mb-2 rounded-2xl bg-[#252624] border border-[#3a3b38] shadow-2xl py-1.5 z-40 max-h-52 overflow-y-auto">
                                <div className="px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-[#8e8e8e] flex items-center justify-between">
                                    <span>{isChatGPT ? 'Chọn Dự án ChatGPT PC' : 'Mention / Target Project (@)'}</span>
                                    <button
                                        type="button"
                                        onClick={() => setMentionMenuOpen(false)}
                                        className="text-[#8e8e8e] hover:text-white p-0.5"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                {(effectiveProjects.length > 0
                                    ? effectiveProjects
                                    : [
                                          {
                                              id: effectiveTargetProjectId,
                                              name: effectiveTargetProjectName,
                                              totalCount: 0,
                                              conversations: []
                                          }
                                      ]
                                ).map(p => {
                                    const isTarget = effectiveTargetProjectId === p.id;
                                    return (
                                        <button
                                            key={`mob_mention_${p.id}`}
                                            type="button"
                                            onMouseDown={e => e.preventDefault()}
                                            onClick={() => {
                                                if (isChatGPT) {
                                                    setChatgptTargetProjectId(p.id);
                                                    setChatgptTargetProjectName(p.name);
                                                } else {
                                                    setTargetNewProjectId(p.id);
                                                    setTargetNewProjectName(p.name);
                                                }
                                                setPromptText(prev =>
                                                    /@\w*$/.test(prev)
                                                        ? prev.replace(/@\w*$/, `@${p.name} `)
                                                        : prev
                                                );
                                                setMentionMenuOpen(false);
                                                setTimeout(() => mobileTextareaRef.current?.focus(), 20);
                                            }}
                                            className={`w-full px-3.5 py-2 flex items-center justify-between hover:bg-white/5 active:bg-white/10 text-left transition-colors gap-2 ${
                                                isTarget ? 'bg-white/[0.06]' : ''
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Folder className="w-4 h-4 text-[#8ab4f8] shrink-0" />
                                                <span className="text-[13.5px] text-[#e3e3e3] truncate">{p.name}</span>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-xs text-[#8e8e8e]">{p.totalCount}</span>
                                                {isTarget && <Check className="w-4 h-4 text-[#8ab4f8]" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {/* MODEL SELECTION BOTTOM SHEET ON MOBILE (Exact match to antigravity.google.com screenshot 1) */}
                    {modelMenuOpen && (
                        <>
                            <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setModelMenuOpen(false)} />
                            <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] bg-[#222321] border-t border-[#383937] pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl max-h-[75vh] flex flex-col">
                                <div className="w-10 h-1 rounded-full bg-[#4a4b48] mx-auto mb-2 shrink-0" />
                                <div className="px-5 py-1.5 text-[13.5px] font-normal text-[#8e8e8e] shrink-0">
                                    Model
                                </div>
                                <div className="overflow-y-auto py-1 space-y-0.5">
                                    {effectiveModels.map(m => {
                                        const isSelected = effectiveSelectedModel.id === m.id;
                                        const badgeLabel =
                                            m.tag === 'New'
                                                ? 'New'
                                                : m.tag === 'Fast'
                                                ? 'Fast'
                                                : m.name.includes('Claude') || m.name.includes('GPT-OSS')
                                                ? 'Notice'
                                                : m.tag || '';
                                        const showBadgeInfoIcon = badgeLabel === 'Fast' || badgeLabel === 'Notice';
                                        return (
                                            <button
                                                key={`mob_mod_${m.id}`}
                                                type="button"
                                                onMouseDown={e => e.preventDefault()}
                                                onClick={() => {
                                                    if (isChatGPT) {
                                                        setChatgptSelectedModel(m);
                                                    } else {
                                                        setSelectedModel(m);
                                                    }
                                                    setModelMenuOpen(false);
                                                }}
                                                className={`w-full px-5 py-3 flex items-center justify-between hover:bg-white/5 active:bg-white/10 text-left transition-colors ${
                                                    isSelected ? 'bg-white/[0.04]' : ''
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                                    <span className="text-[15px] text-[#e3e3e3] font-normal truncate">
                                                        {m.name.includes('Claude') || m.name.includes('GPT-OSS')
                                                            ? m.label
                                                            : m.name}
                                                    </span>
                                                    {m.tier && !m.name.includes('Claude') && !m.name.includes('GPT-OSS') && (
                                                        <span className="text-[15px] font-normal text-[#8e8e8e]">
                                                            {m.tier}
                                                        </span>
                                                    )}
                                                    {badgeLabel && (
                                                        <span className="px-2 py-0.5 rounded-full bg-[#333432] text-[12px] text-[#b8b8b8] inline-flex items-center gap-1">
                                                            <span>{badgeLabel}</span>
                                                            {showBadgeInfoIcon && <Info className="w-3 h-3 text-[#8e8e8e]" />}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2.5 shrink-0">
                                                    {isSelected && <Check className="w-4 h-4 text-[#e3e3e3]" />}
                                                    <ChevronRight className="w-4 h-4 text-[#787878]" />
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="border-t border-[#333432] mt-1 pt-1 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setModelMenuOpen(false);
                                            setSettingsModalOpen(true);
                                        }}
                                        className="w-full px-5 py-3 flex items-center justify-between text-[#b8b8b8] hover:text-white hover:bg-white/5 transition-colors"
                                    >
                                        <span className="flex items-center gap-2.5 text-[14.5px]">
                                            <Gauge className="w-4 h-4 text-[#8e8e8e]" />
                                            <span>View Usage</span>
                                        </span>
                                        <ChevronRight className="w-4 h-4 text-[#787878]" />
                                    </button>
                                </div>
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
                        className="bg-[#252624] border border-[#3a3b38] rounded-[24px] px-4 pt-3 pb-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.4)] transition-colors"
                    >
                        {renderComposerAttachments(true)}

                        <textarea
                            ref={mobileTextareaRef}
                            rows={isMobileComposerExpanded ? 5 : 1}
                            value={promptText}
                            onFocus={() => {
                                if (mobileBlurTimerRef.current) {
                                    clearTimeout(mobileBlurTimerRef.current);
                                    mobileBlurTimerRef.current = null;
                                }
                                setIsMobileComposerFocused(true);
                                if (typeof window !== 'undefined' && window.scrollY > 0) {
                                    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
                                }
                                if (activeConversationId) {
                                    setTimeout(() => {
                                        scrollMessagesToBottom(true);
                                    }, 120);
                                }
                            }}
                            onBlur={() => {
                                if (mobileBlurTimerRef.current) {
                                    clearTimeout(mobileBlurTimerRef.current);
                                }
                                mobileBlurTimerRef.current = setTimeout(() => {
                                    setIsMobileComposerFocused(false);
                                }, 160);
                            }}
                            onChange={handlePromptChange}
                            onPaste={handlePasteMedia}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                    e.preventDefault();
                                    handleSubmitPrompt();
                                }
                            }}
                            placeholder={
                                isChatGPT
                                    ? chatgptSubTab === 'work'
                                        ? 'Làm việc với ChatGPT...'
                                        : 'Nhắn tin cho ChatGPT...'
                                    : 'Ask anything, @ to mention, / for actions'
                            }
                            className={`w-full bg-transparent text-[#e3e3e3] placeholder-[#8e8e8e] text-[16px] leading-snug outline-none resize-none ${
                                isMobileComposerExpanded ? 'min-h-[110px] max-h-[42vh]' : 'min-h-[26px] max-h-28'
                            }`}
                        />

                        <div className="mt-2.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3 min-w-0">
                                <button
                                    type="button"
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => fileInputRef.current?.click()}
                                    title="Đính kèm ảnh, video, tài liệu"
                                    className="p-1 -ml-1 rounded-full text-[#9e9e9e] hover:text-[#e3e3e3] hover:bg-white/5 transition-colors shrink-0"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>

                                <button
                                    type="button"
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => {
                                        setModelMenuOpen(prev => !prev);
                                        setSlashMenuOpen(false);
                                        setMentionMenuOpen(false);
                                    }}
                                    className="flex items-center gap-1.5 py-1 text-left transition-colors min-w-0 truncate"
                                >
                                    <span className="text-[14px] text-[#b8b8b8] font-normal truncate">
                                        {effectiveSelectedModel.name}
                                    </span>
                                    {effectiveSelectedModel.tier && (
                                        <span className="text-[14px] text-[#787878] font-normal shrink-0">
                                            {effectiveSelectedModel.tier}
                                        </span>
                                    )}
                                    <ChevronUp className="w-3.5 h-3.5 text-[#787878] shrink-0" />
                                </button>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0">
                                <button
                                    type="button"
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={handleVoiceInput}
                                    title="Nhập bằng giọng nói tiếng Việt"
                                    className={`p-1.5 rounded-full transition-colors ${
                                        isListeningVoice
                                            ? 'text-[#ec407a] bg-[#ec407a]/15 animate-pulse'
                                            : 'text-[#9e9e9e] hover:text-[#e3e3e3]'
                                    }`}
                                >
                                    <Mic className="w-[18px] h-[18px]" />
                                </button>

                                {(isSubmitting || activeConversation?.isRunning) && !promptText.trim() && attachedMedia.length === 0 ? (
                                    <button
                                        type="button"
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={handleCancelRunning}
                                        title="Dừng tác vụ đang chạy"
                                        className="w-9 h-9 rounded-full bg-[#333432] hover:bg-[#3e3f3c] flex items-center justify-center transition-all active:scale-95 shrink-0"
                                    >
                                        <span className="w-3.5 h-3.5 rounded-[3px] bg-[#ea4335] block" />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={handleSubmitPrompt}
                                        disabled={isSubmitting || (!promptText.trim() && attachedMedia.length === 0)}
                                        title="Gửi yêu cầu"
                                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95 shrink-0 ${
                                            !isSubmitting && (promptText.trim() || attachedMedia.length > 0)
                                                ? isChatGPT
                                                    ? 'bg-[#0066ff] text-white shadow-md'
                                                    : 'bg-[#e3e3e3] text-[#191919] shadow-md'
                                                : 'bg-[#383937] text-[#9e9e9e]'
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
            )}

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
                                <h3 className="text-[14.5px] font-medium">
                                    {isChatGPT ? 'Lịch sử trò chuyện ChatGPT PC' : 'Conversation History'}
                                </h3>
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
                            {effectiveProjects.flatMap(p => p.conversations).map(conv => (
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
                                        <div className="text-xs text-[#787878] flex items-center gap-1.5">
                                            <Folder className="w-3 h-3" />
                                            <span>{conv.projectName}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {conv.hasError && (
                                            <AlertCircleRedIcon className="w-3.5 h-3.5" />
                                        )}
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
                                <span className="px-2 py-0.5 rounded-full bg-[#e6f4ea] text-[#137333] text-xs font-medium">
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
                                <span className="px-2 py-0.5 rounded-full bg-[#e6f4ea] text-[#137333] text-xs font-medium">
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
                        <div className="space-y-2 text-[13px] max-h-96 overflow-y-auto pr-1">
                            <div className="p-3 rounded-xl bg-[#f7f7f5] border border-[#e6e6e4]">
                                <div className="font-medium text-[#1f1f1f]">
                                    Workspace Rules ({customData?.rules?.length || 2})
                                </div>
                                <div className="text-[12px] text-[#6e6e6e] mt-1 space-y-1">
                                    {customData?.rules && customData.rules.length > 0 ? (
                                        customData.rules.map((r, idx) => (
                                            <div key={idx} className="flex items-center justify-between gap-2">
                                                <span className="font-mono text-[#1f1f1f] truncate">{r.name}</span>
                                                <span className="text-[#8e8e8e] shrink-0">
                                                    {r.sizeBytes ? `${(r.sizeBytes / 1024).toFixed(1)} KB` : 'Active'}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <div>~/.gemini/GEMINI.md · Documents/AG/AGENTS.md (Active)</div>
                                    )}
                                </div>
                            </div>
                            <div className="p-3 rounded-xl bg-[#f7f7f5] border border-[#e6e6e4]">
                                <div className="font-medium text-[#1f1f1f]">
                                    Skills & Workflows ({customData?.skills?.length || 19})
                                </div>
                                <div className="text-[12px] text-[#6e6e6e] mt-1">
                                    {customData?.skills && customData.skills.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                                            {customData.skills.map((s, idx) => (
                                                <span
                                                    key={idx}
                                                    className="px-2 py-0.5 rounded-md bg-white border border-[#dfdfd8] text-[#3c3c3c] font-mono text-xs"
                                                >
                                                    {s.name}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        '19 workspace skills loaded (colab-operator, design, slides, weixin, douyin...)'
                                    )}
                                </div>
                            </div>
                            <div className="p-3 rounded-xl bg-[#f7f7f5] border border-[#e6e6e4]">
                                <div className="font-medium text-[#1f1f1f]">
                                    MCP Servers ({customData?.mcpServers?.length || 4})
                                </div>
                                <div className="text-[12px] text-[#6e6e6e] mt-1 space-y-1">
                                    {customData?.mcpServers && customData.mcpServers.length > 0 ? (
                                        customData.mcpServers.map((m, idx) => (
                                            <div key={idx} className="flex items-center justify-between">
                                                <span className="font-mono text-[#1f1f1f]">{m.name}</span>
                                                <span className="text-[#137333] font-medium">
                                                    {m.toolsCount || 0} tools · Connected
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <div>botcake · fanpage_ai_hub · gdrive · blender (Connected)</div>
                                    )}
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
                            <h3 className="text-[15px] font-medium">
                                {isChatGPT ? 'Chọn Dự án ChatGPT PC' : 'Select Project'}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setNewProjectModalOpen(false)}
                                className="text-[#8e8e8e] hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="space-y-1 max-h-64 overflow-y-auto">
                            {(effectiveProjects.length > 0
                                ? effectiveProjects
                                : [
                                      {
                                          id: effectiveTargetProjectId,
                                          name: effectiveTargetProjectName,
                                          totalCount: 0,
                                          conversations: []
                                      }
                                  ]
                            ).map(p => (
                                <button
                                    key={`modal_proj_${p.id}`}
                                    type="button"
                                    onClick={() => {
                                        if (isChatGPT) {
                                            setChatgptTargetProjectId(p.id);
                                            setChatgptTargetProjectName(p.name);
                                        } else {
                                            setTargetNewProjectId(p.id);
                                            setTargetNewProjectName(p.name);
                                        }
                                        setNewProjectModalOpen(false);
                                        navigateToConversation(null, true);
                                        setTimeout(() => {
                                            desktopTextareaRef.current?.focus();
                                            mobileTextareaRef.current?.focus();
                                        }, 80);
                                    }}
                                    className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between text-left transition-colors ${
                                        effectiveTargetProjectId === p.id
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
                                {isChatGPT ? (
                                    <ChatGPTLogo className="w-5 h-5 text-white" />
                                ) : (
                                    <AntigravityRibbonLogo className="w-5 h-5" />
                                )}
                                <h3 className="text-[15px] font-medium text-white">
                                    {isChatGPT ? 'ChatGPT PC Settings' : 'Antigravity Settings'}
                                </h3>
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
                                    {isChatGPT ? 'ChatGPT PC (.codex Realtime Sync)' : `${hostName} (WebSocket Realtime Active)`}
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
                                    {isChatGPT ? `${chatgptPermMode} · ${effectiveSelectedModel.label}` : `${execMode} · ${envMode} Workspace`}
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
            </>
            )}
        </div>
    );
};
