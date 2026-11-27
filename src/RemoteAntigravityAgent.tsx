import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { calibrateSrgbLutStage } from "../../utils/srgbLutProfile";
import { isEmailMaskEnabled, maskEmailAddress, maskEmailsInText, setEmailMaskEnabled } from '../../utils/quotaDisplay';
import HighlightText from '../../utils/HighlightText';
import { matchesAllVnTokens, scoreVnSearchFields, tokenizeVnSearch } from '../../utils/vnSearch';
import {
    capturePreSendBaseline,
    mergePendingUserMessage,
    type PendingUserMsgEntry
} from '../../utils/pendingPromptMerge';
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
    Info,
    Eye,
    EyeOff,
    LogOut,
    User,
    ExternalLink
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
    onOpenVirtualOffice?: () => void;
    onOpenProfile?: () => void;
    onLogout?: () => void;
    initialProvider?: 'antigravity' | 'antigravity2' | 'win1' | 'chatgpt';
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

export interface TurnStateInfo {
    phase: 'idle' | 'running' | 'retrying' | 'cancelling';
    retryAttempt?: number;
    maxRetries?: number;
    lastError?: string;
    stalledSeconds?: number;
    queuedCount?: number;
}

export interface QueuedPromptItem {
    id: string;
    cmdId?: string;
    content: string;
    media?: MediaAttachment[];
    model?: string;
    status: string;
    createdAt: number;
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
    provider?: 'antigravity' | 'antigravity2' | 'win1' | 'chatgpt';
    sourceKind?: string;
    model?: string;
    reasoningEffort?: string;
    hasError?: boolean;
    errorMessage?: string;
    turnState?: TurnStateInfo;
    queuedCount?: number;
    matchedIn?: string;
    matchedMsgId?: string;
    matchCount?: number;
    snippet?: string;
    matchScore?: number;
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
    isError?: boolean;
    errorCode?: string;
    errorDetail?: string;
    httpStatus?: number;
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
    modelId?: string;
    status: string;
    isRunning: boolean;
    hasError?: boolean;
    errorMessage?: string;
    turnState?: TurnStateInfo;
    queuedPrompts?: QueuedPromptItem[];
    pinned: boolean;
    stepCount: number;
    lastModifiedTime?: string;
    messages: TrajectoryMessage[];
}

const DEFAULT_MODELS: CompanionModel[] = [
    {
        id: 'MODEL_PLACEHOLDER_M532',
        label: 'Gemini 4 Neon (High)',
        name: 'Gemini 4 Neon',
        tier: 'High',
        tag: 'New',
        cliModel: 'pro',
        proxyModel: 'gemini-2.5-flash',
        remainingFraction: 0.99
    },
    {
        id: 'MODEL_PLACEHOLDER_M535',
        label: 'Gemini 4 Neon (Extra)',
        name: 'Gemini 4 Neon',
        tier: 'Extra',
        tag: 'New',
        cliModel: 'pro',
        proxyModel: 'gemini-2.5-flash',
        remainingFraction: 0.99
    },
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
    permittedAccounts,
    originUrl,
    onToast,
    onBackToPortal,
    onOpenMobileMenu,
    onOpenVirtualOffice,
    onOpenProfile,
    onLogout,
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

    // Provider State: 'antigravity' | 'antigravity2' | 'win1' | 'chatgpt'
    calibrateSrgbLutStage("hub:remote_agent");
    const [activeProvider, setActiveProvider] = useState<'antigravity' | 'antigravity2' | 'win1' | 'chatgpt'>(() => {
        if (initialProvider) return initialProvider;
        if (typeof window !== 'undefined') {
            const pWin = (window as any).__agRemoteActiveProvider;
            if (pWin === 'chatgpt' || pWin === 'antigravity2' || pWin === 'win1' || pWin === 'antigravity') return pWin;
            try {
                const sp = new URLSearchParams(window.location.search);
                const qp = sp.get('provider');
                if (qp === 'chatgpt' || qp === 'antigravity2' || qp === 'win1') return qp;
            } catch {}
        }
        return 'antigravity';
    });
    const isChatGPT = activeProvider === 'chatgpt';
    const isAg2 = activeProvider === 'antigravity2';
    const isWin1 = activeProvider === 'win1';
    const [ag2HostName, setAg2HostName] = useState<string>(`${defaultHostName} (AG 2)`);
    const [ag2Online, setAg2Online] = useState<boolean>(true);
    const [ag2Models, setAg2Models] = useState<CompanionModel[]>(DEFAULT_MODELS);
    const [ag2SelectedModel, setAg2SelectedModel] = useState<CompanionModel>(DEFAULT_MODELS[0]);
    const [ag2PinnedConversations, setAg2PinnedConversations] = useState<CompanionConversationItem[]>([]);
    const [ag2Projects, setAg2Projects] = useState<CompanionProjectGroup[]>([]);
    const [ag2TargetProjectId, setAg2TargetProjectId] = useState<string>(defaultProjectId);
    const [ag2TargetProjectName, setAg2TargetProjectName] = useState<string>(defaultProjectName);
    const [pcActiveAg2Account, setPcActiveAg2Account] = useState<{
        id?: string;
        email?: string;
        name?: string;
        tier?: string;
        source?: string;
        online?: boolean;
    } | null>(null);
    const [win1HostName, setWin1HostName] = useState<string>('WIN1-17TRIEU');
    const [win1Online, setWin1Online] = useState<boolean>(false);
    const [win1Models, setWin1Models] = useState<CompanionModel[]>(DEFAULT_MODELS);
    const [win1SelectedModel, setWin1SelectedModel] = useState<CompanionModel>(DEFAULT_MODELS[0]);
    const [win1PinnedConversations, setWin1PinnedConversations] = useState<CompanionConversationItem[]>([]);
    const [win1Projects, setWin1Projects] = useState<CompanionProjectGroup[]>([]);
    const [win1TargetProjectId, setWin1TargetProjectId] = useState<string>('default-cli-project');
    const [win1TargetProjectName, setWin1TargetProjectName] = useState<string>('CLI Project');
    const [pcActiveWin1Account, setPcActiveWin1Account] = useState<{
        id?: string;
        email?: string;
        name?: string;
        tier?: string;
        source?: string;
        online?: boolean;
    } | null>(null);
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
    const [pcActiveAgAccount, setPcActiveAgAccount] = useState<{
        id?: string;
        email?: string;
        name?: string;
        tier?: string;
        source?: string;
    } | null>(null);
    const [pcActiveChatgptAccount, setPcActiveChatgptAccount] = useState<{
        accountId?: string;
        email?: string;
        name?: string;
        planType?: string;
        source?: string;
    } | null>(null);
    const [showAccountEmails, setShowAccountEmails] = useState<boolean>(() => !isEmailMaskEnabled());

    useEffect(() => {
        const syncMaskPref = () => setShowAccountEmails(!isEmailMaskEnabled());
        window.addEventListener('storage', syncMaskPref);
        window.addEventListener('focus', syncMaskPref);
        return () => {
            window.removeEventListener('storage', syncMaskPref);
            window.removeEventListener('focus', syncMaskPref);
        };
    }, []);

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
    const [deepSearchResults, setDeepSearchResults] = useState<CompanionConversationItem[]>([]);
    const [deepSearchTotal, setDeepSearchTotal] = useState<number>(0);
    const [deepSearchLoading, setDeepSearchLoading] = useState<boolean>(false);
    const [deepSearchWarming, setDeepSearchWarming] = useState<boolean>(false);
    const [historySearchQuery, setHistorySearchQuery] = useState<string>('');
    const [inConvSearchOpen, setInConvSearchOpen] = useState<boolean>(false);
    const [inConvSearchQuery, setInConvSearchQuery] = useState<string>('');
    const [inConvMatchCursor, setInConvMatchCursor] = useState<number>(0);
    const [pendingJumpMsgId, setPendingJumpMsgId] = useState<string | null>(null);
    const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
    const sidebarSearchInputRef = useRef<HTMLInputElement | null>(null);
    const inConvSearchInputRef = useRef<HTMLInputElement | null>(null);
    const suppressAutoScrollUntilRef = useRef<number>(0);

    // Active Conversation View State & Back/Forward History Stack
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [activeConversation, setActiveConversation] = useState<ConversationDetail | null>(null);
    const [isLoadingConversation, setIsLoadingConversation] = useState<boolean>(false);
    const [targetNewProjectId, setTargetNewProjectId] = useState<string>(defaultProjectId);
    const [targetNewProjectName, setTargetNewProjectName] = useState<string>(defaultProjectName);
    const [navHistory, setNavHistory] = useState<Array<string | null>>([null]);
    const [navIndex, setNavIndex] = useState<number>(0);

    // Effective active lists & selections depending on activeProvider ('antigravity' | 'antigravity2' | 'win1' | 'chatgpt')
    const CHATGPT_CLOUD_IDS = useMemo(() => new Set(['chatgpt-cloud-chat', 'chatgpt-cloud-sessions']), []);
    const effectiveModels = isChatGPT ? chatgptModels : isAg2 ? ag2Models : isWin1 ? win1Models : models;
    const effectiveSelectedModel = isChatGPT ? chatgptSelectedModel : isAg2 ? ag2SelectedModel : isWin1 ? win1SelectedModel : selectedModel;
    const effectivePinnedConversations = useMemo(() => {
        if (!isChatGPT) return isAg2 ? ag2PinnedConversations : isWin1 ? win1PinnedConversations : pinnedConversations;
        if (chatgptSubTab === 'chat') {
            return chatgptPinnedConversations.filter(
                c => c.sourceKind === 'chat' || CHATGPT_CLOUD_IDS.has(c.projectId)
            );
        }
        return chatgptPinnedConversations.filter(
            c => c.sourceKind !== 'chat' && !CHATGPT_CLOUD_IDS.has(c.projectId)
        );
    }, [isChatGPT, isAg2, isWin1, pinnedConversations, ag2PinnedConversations, win1PinnedConversations, chatgptPinnedConversations, chatgptSubTab, CHATGPT_CLOUD_IDS]);
    const effectiveProjects = useMemo(() => {
        if (!isChatGPT) return isAg2 ? ag2Projects : isWin1 ? win1Projects : projects;
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
    }, [isChatGPT, isAg2, isWin1, projects, ag2Projects, win1Projects, chatgptProjects, chatgptSubTab, CHATGPT_CLOUD_IDS]);
    const effectiveTargetProjectId = isChatGPT ? chatgptTargetProjectId : isAg2 ? ag2TargetProjectId : isWin1 ? win1TargetProjectId : targetNewProjectId;
    const effectiveTargetProjectName = isChatGPT ? chatgptTargetProjectName : isAg2 ? ag2TargetProjectName : isWin1 ? win1TargetProjectName : targetNewProjectName;

    const setEffectiveTargetProject = (pid: string, pname: string) => {
        if (isChatGPT) {
            setChatgptTargetProjectId(pid);
            setChatgptTargetProjectName(pname);
        } else if (isAg2) {
            setAg2TargetProjectId(pid);
            setAg2TargetProjectName(pname);
        } else if (isWin1) {
            setWin1TargetProjectId(pid);
            setWin1TargetProjectName(pname);
        } else {
            setTargetNewProjectId(pid);
            setTargetNewProjectName(pname);
        }
    };

    const pcDefaultModelIdRef = useRef<{ antigravity: string; antigravity2: string; win1: string }>({
        antigravity: '',
        antigravity2: '',
        win1: ''
    });
    const manualModelOverrideRef = useRef<
        Record<string, { cid: string | null; modelId: string; serverModelIdAtPick: string }>
    >({});
    const activeProviderRef = useRef<string>(activeProvider);
    activeProviderRef.current = activeProvider;
    const activeConvModelIdRef = useRef<string>('');
    activeConvModelIdRef.current =
        activeConversation && activeConversation.id === activeConversationId
            ? String(activeConversation.modelId || '').trim()
            : '';

    const normalizeModelList = useCallback((list: CompanionModel[]): CompanionModel[] => {
        return list.map(m => {
            const rawTier = String(m.tier || '').trim();
            if (rawTier.toLowerCase() === 'xhigh') {
                return {
                    ...m,
                    tier: 'Extra',
                    label: m.label ? m.label.replace(/\(XHigh\)/i, '(Extra)') : `${m.name} (Extra)`
                };
            }
            return m;
        });
    }, []);

    const setEffectiveSelectedModel = (m: CompanionModel) => {
        if (isChatGPT) {
            setChatgptSelectedModel(m);
            return;
        }
        const provKey = activeProvider as 'antigravity' | 'antigravity2' | 'win1';
        const serverMid =
            (activeConversation?.id === activeConversationId ? activeConversation?.modelId : '') ||
            pcDefaultModelIdRef.current[provKey] ||
            '';
        manualModelOverrideRef.current[provKey] = {
            cid: activeConversationId,
            modelId: m.id,
            serverModelIdAtPick: serverMid
        };
        if (isAg2) setAg2SelectedModel(m);
        else if (isWin1) setWin1SelectedModel(m);
        else setSelectedModel(m);
    };

    // Sync selected model dropdown seamlessly with Antigravity PC (active conversation's modelId > PC defaultModelId)
    useEffect(() => {
        if (isChatGPT) return;
        if (!Array.isArray(effectiveModels) || effectiveModels.length === 0) return;
        const provKey = activeProvider as 'antigravity' | 'antigravity2' | 'win1';
        const convMid =
            activeConversation && activeConversation.id === activeConversationId
                ? String(activeConversation.modelId || '').trim()
                : '';
        const targetMid = convMid || pcDefaultModelIdRef.current[provKey] || effectiveModels[0]?.id || '';
        if (!targetMid) return;

        const override = manualModelOverrideRef.current[provKey];
        if (
            override &&
            override.cid === activeConversationId &&
            override.serverModelIdAtPick === targetMid
        ) {
            // Respect the user's explicit manual dropdown selection for this conversation until sent or changed on PC
            return;
        }
        if (override && (override.cid !== activeConversationId || override.serverModelIdAtPick !== targetMid)) {
            delete manualModelOverrideRef.current[provKey];
        }

        const matched = effectiveModels.find(m => m.id === targetMid);
        if (!matched) return;

        if (isAg2) {
            setAg2SelectedModel(prev => (prev.id === matched.id ? prev : matched));
        } else if (isWin1) {
            setWin1SelectedModel(prev => (prev.id === matched.id ? prev : matched));
        } else {
            setSelectedModel(prev => (prev.id === matched.id ? prev : matched));
        }
    }, [activeProvider, activeConversationId, activeConversation?.id, activeConversation?.modelId, effectiveModels, isAg2, isWin1, isChatGPT]);

    const providerConvMemoryRef = useRef<{
        antigravity: { id: string | null; conv: ConversationDetail | null; nav: Array<string | null>; navIdx: number };
        antigravity2: { id: string | null; conv: ConversationDetail | null; nav: Array<string | null>; navIdx: number };
        win1: { id: string | null; conv: ConversationDetail | null; nav: Array<string | null>; navIdx: number };
        chatgpt: { id: string | null; conv: ConversationDetail | null; nav: Array<string | null>; navIdx: number };
    }>({
        antigravity: { id: null, conv: null, nav: [null], navIdx: 0 },
        antigravity2: { id: null, conv: null, nav: [null], navIdx: 0 },
        win1: { id: null, conv: null, nav: [null], navIdx: 0 },
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
    const [isCancelling, setIsCancelling] = useState<boolean>(false);
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
        provider?: string;
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
        (nextProvider: 'antigravity' | 'antigravity2' | 'win1' | 'chatgpt') => {
            if (typeof window !== 'undefined') {
                (window as any).__agRemoteActiveProvider = nextProvider;
                try {
                    const url = new URL(window.location.href);
                    if (nextProvider === 'chatgpt' || nextProvider === 'antigravity2' || nextProvider === 'win1') {
                        url.searchParams.set('provider', nextProvider);
                    } else {
                        url.searchParams.delete('provider');
                    }
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
            if (detail === 'chatgpt' || detail === 'antigravity' || detail === 'antigravity2' || detail === 'win1') {
                handleSwitchProvider(detail);
            }
        };
        window.addEventListener('ag-remote-switch-provider', onExtSwitch);
        return () => window.removeEventListener('ag-remote-switch-provider', onExtSwitch);
    }, [handleSwitchProvider]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const applyPendingPrompt = (rawPrompt?: unknown) => {
            const txt = typeof rawPrompt === 'string' ? rawPrompt.trim() : '';
            if (!txt) return;
            (window as any).__agPendingRemotePrompt = '';
            handleSwitchProvider('antigravity');
            setPromptText(txt);
            window.setTimeout(() => {
                const el = desktopTextareaRef.current || mobileTextareaRef.current;
                if (el) {
                    el.focus();
                    try {
                        el.setSelectionRange(txt.length, txt.length);
                    } catch {}
                }
            }, 90);
        };

        const queued = (window as any).__agPendingRemotePrompt;
        if (typeof queued === 'string' && queued.trim()) {
            applyPendingPrompt(queued);
        }
        const onPrefill = (e: Event) => {
            applyPendingPrompt((e as CustomEvent).detail);
        };
        window.addEventListener('ag-prefill-remote-prompt', onPrefill);
        return () => window.removeEventListener('ag-prefill-remote-prompt', onPrefill);
    }, [handleSwitchProvider]);
    const pendingUserMsgsRef = useRef<Record<string, PendingUserMsgEntry<MediaAttachment>>>({});
    const isSubmittingRef = useRef(false);

    // Merge optimistic sent user message into conversation detail without relying on client-vs-PC clock equality
    const mergePendingUserMsg = useCallback(
        (detail: ConversationDetail): ConversationDetail =>
            mergePendingUserMessage(detail, pendingUserMsgsRef.current, {
                defaultProjectId,
                defaultProjectName
            }),
        [defaultProjectId, defaultProjectName]
    );

    // Universal Companion Command Dispatcher (works on HTTP LAN :8046 AND HTTPS https://aihot.vn via same-origin relay)
    const dispatchCompanionCommand = useCallback(
        async (
            action: 'new' | 'send' | 'pin' | 'cancel' | 'cancel_queued' | 'save_conv' | 'open-chatgpt-pc',
            payload: Record<string, any>
        ): Promise<any> => {
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
        if (data?.activeAccount && typeof data.activeAccount === 'object') {
            setPcActiveAgAccount(data.activeAccount);
        }
        if (Array.isArray(data?.models) && data.models.length > 0) {
            const normModels = normalizeModelList(data.models);
            const pcDefId = String(data?.defaultModelId || normModels[0]?.id || '').trim();
            pcDefaultModelIdRef.current.antigravity = pcDefId;
            setModels(normModels);
            setSelectedModel(prev => {
                const ov = manualModelOverrideRef.current.antigravity;
                if (ov && ov.modelId) {
                    const picked = normModels.find(m => m.id === ov.modelId);
                    if (picked) return picked;
                }
                const convMid = activeProviderRef.current === 'antigravity' ? activeConvModelIdRef.current : '';
                const desiredId = convMid || pcDefId;
                const desired = desiredId ? normModels.find(m => m.id === desiredId) : undefined;
                if (desired) return desired;
                return normModels.find(m => m.id === prev.id) || normModels[0];
            });
        }
        if (Array.isArray(data?.pinnedConversations)) {
            setPinnedConversations(data.pinnedConversations);
        }
        if (Array.isArray(data?.projects)) {
            setProjects(data.projects);
        }
        if (data?.antigravity2 && typeof data.antigravity2 === 'object') {
            const ag2 = data.antigravity2;
            if (ag2.host?.name) setAg2HostName(String(ag2.host.name));
            if (typeof ag2.host?.online === 'boolean') setAg2Online(ag2.host.online);
            if (ag2.activeAccount && typeof ag2.activeAccount === 'object') {
                setPcActiveAg2Account(ag2.activeAccount);
            }
            if (Array.isArray(ag2.models) && ag2.models.length > 0) {
                const normAg2Models = normalizeModelList(ag2.models);
                const ag2DefId = String(ag2.defaultModelId || normAg2Models[0]?.id || '').trim();
                pcDefaultModelIdRef.current.antigravity2 = ag2DefId;
                setAg2Models(normAg2Models);
                setAg2SelectedModel(prev => {
                    const ov = manualModelOverrideRef.current.antigravity2;
                    if (ov && ov.modelId) {
                        const picked = normAg2Models.find(m => m.id === ov.modelId);
                        if (picked) return picked;
                    }
                    const convMid = activeProviderRef.current === 'antigravity2' ? activeConvModelIdRef.current : '';
                    const desiredId = convMid || ag2DefId;
                    const desired = desiredId ? normAg2Models.find(m => m.id === desiredId) : undefined;
                    if (desired) return desired;
                    return normAg2Models.find(m => m.id === prev.id) || normAg2Models[0];
                });
            }
            if (Array.isArray(ag2.pinnedConversations)) {
                setAg2PinnedConversations(ag2.pinnedConversations);
            }
            if (Array.isArray(ag2.projects)) {
                setAg2Projects(ag2.projects);
            }
        }
        if (data?.win1 && typeof data.win1 === 'object') {
            const w1 = data.win1;
            if (w1.host?.name) setWin1HostName(String(w1.host.name));
            if (typeof w1.host?.online === 'boolean') setWin1Online(w1.host.online);
            if (w1.activeAccount && typeof w1.activeAccount === 'object') {
                setPcActiveWin1Account(w1.activeAccount);
            } else {
                setPcActiveWin1Account(null);
            }
            if (Array.isArray(w1.models) && w1.models.length > 0) {
                const normW1Models = normalizeModelList(w1.models);
                const w1DefId = String(w1.defaultModelId || normW1Models[0]?.id || '').trim();
                pcDefaultModelIdRef.current.win1 = w1DefId;
                setWin1Models(normW1Models);
                setWin1SelectedModel(prev => {
                    const ov = manualModelOverrideRef.current.win1;
                    if (ov && ov.modelId) {
                        const picked = normW1Models.find(m => m.id === ov.modelId);
                        if (picked) return picked;
                    }
                    const pcDef = w1DefId ? normW1Models.find(m => m.id === w1DefId) : undefined;
                    if (pcDef) return pcDef;
                    return normW1Models.find(m => m.id === prev.id) || normW1Models[0];
                });
            }
            if (Array.isArray(w1.pinnedConversations)) {
                setWin1PinnedConversations(w1.pinnedConversations);
            }
            if (Array.isArray(w1.projects)) {
                setWin1Projects(w1.projects);
            }
        }
        if (data?.chatgpt) {
            const cg: ChatGPTOverviewData & { activeAccount?: any } = data.chatgpt;
            if (cg.activeAccount && typeof cg.activeAccount === 'object') {
                setPcActiveChatgptAccount(cg.activeAccount);
            }
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
    }, [isSystemOwner, normalizeModelList]);

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
        const ts = d.turnState;
        const tsSig = ts ? `${ts.phase}:${ts.retryAttempt || 0}:${ts.maxRetries || 0}:${ts.lastError || ''}:${ts.queuedCount || 0}` : '';
        const qpSig = (d.queuedPrompts || []).map(q => `${q.id}:${q.status}`).join(',');
        return `${d.id}:${d.modelId || ''}:${d.status}:${d.isRunning}:${d.pinned}:${d.stepCount}:${msgs.length}:${last?.id || ''}:${last?.content?.length || 0}:${last?.thinking?.length || 0}:${tcs.length}:${lastTcOut}:${lastTcStatus}:${last?.completed ?? ''}:${tsSig}:${qpSig}`;
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
                            `${base}/api/ag-companion/conversation/${encodeURIComponent(cid)}?markRead=1&limit=400&memberId=${encodeURIComponent(effectiveMemberId)}&provider=${encodeURIComponent(activeProvider)}`,
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
    }, [getCompanionBaseUrls, isSystemOwner, safeMemberFolder, effectiveMemberId, member.id, originUrl, mergePendingUserMsg, computeConversationSig, activeProvider]);

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
            if (Date.now() < suppressAutoScrollUntilRef.current || pendingJumpMsgId) {
                return;
            }
            setTimeout(() => {
                if (Date.now() >= suppressAutoScrollUntilRef.current) {
                    scrollMessagesToBottom(!isFirstOpen);
                }
            }, 60);
        }
    }, [activeConversation, scrollMessagesToBottom, pendingJumpMsgId]);

    // Navigate to a conversation (and push to Back/Forward history stack)
    const navigateToConversation = (cid: string | null, pushHistory = true) => {
        prevMsgSignatureRef.current = '';
        setVisibleGroupLimit(40);
        setInConvMatchCursor(0);
        setHighlightedMsgId(null);
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

    // Handle opening a conversation from Pinned, Projects list, or Deep Search
    const handleOpenConversation = (conv: CompanionConversationItem) => {
        const targetProv: 'antigravity' | 'antigravity2' | 'win1' | 'chatgpt' =
            conv.provider === 'chatgpt'
                ? 'chatgpt'
                : conv.provider === 'antigravity2'
                ? 'antigravity2'
                : conv.provider === 'win1'
                ? 'win1'
                : activeProvider;
        if (targetProv !== activeProvider) {
            handleSwitchProvider(targetProv);
        }
        if (targetProv === 'chatgpt') {
            setChatgptTargetProjectId(conv.projectId);
            setChatgptTargetProjectName(conv.projectName);
        } else if (targetProv === 'antigravity2') {
            setAg2TargetProjectId(conv.projectId);
            setAg2TargetProjectName(conv.projectName);
        } else if (targetProv === 'win1') {
            setWin1TargetProjectId(conv.projectId);
            setWin1TargetProjectName(conv.projectName);
        } else {
            setTargetNewProjectId(conv.projectId);
            setTargetNewProjectName(conv.projectName);
        }
        setHistoryModalOpen(false);
        setPendingJumpMsgId(conv.matchedMsgId ? String(conv.matchedMsgId) : null);
        navigateToConversation(conv.id, true);
        // Optimistically clear unread dot in UI
        const clearUnread = (prev: CompanionProjectGroup[]) =>
            prev.map(p => ({
                ...p,
                conversations: p.conversations.map(c => (c.id === conv.id ? { ...c, unread: false } : c))
            }));
        if (targetProv === 'chatgpt') {
            setChatgptProjects(clearUnread);
        } else if (targetProv === 'antigravity2') {
            setAg2Projects(clearUnread);
        } else if (targetProv === 'win1') {
            setWin1Projects(clearUnread);
        } else {
            setProjects(clearUnread);
        }
    };

    // Handoff query from Global Ctrl+K Quick Search Modal
    useEffect(() => {
        const applyHandoff = (qStr: string) => {
            if (!qStr) return;
            setSearchBarOpen(true);
            setSearchQuery(qStr);
            window.setTimeout(() => sidebarSearchInputRef.current?.focus(), 60);
        };
        try {
            const raw = sessionStorage.getItem('aihot_conv_handoff');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed?.target === 'a1') {
                    sessionStorage.removeItem('aihot_conv_handoff');
                    applyHandoff(String(parsed.query || ''));
                }
            }
        } catch {}
        const onHandoff = (ev: Event) => {
            const det = (ev as CustomEvent)?.detail;
            if (det && det.target === 'a1') {
                applyHandoff(String(det.query || ''));
            }
        };
        window.addEventListener('aihot-conv-search-handoff', onHandoff);
        return () => window.removeEventListener('aihot-conv-search-handoff', onHandoff);
    }, []);

    // Debounced Deep Backend Search across ALL Antigravity & ChatGPT transcripts (/api/ag-companion/search)
    const activeBackendSearchQuery = historyModalOpen ? historySearchQuery : searchQuery;
    useEffect(() => {
        const qTrim = activeBackendSearchQuery.trim();
        if (qTrim.length < 2) {
            setDeepSearchResults([]);
            setDeepSearchTotal(0);
            setDeepSearchLoading(false);
            setDeepSearchWarming(false);
            return;
        }
        let cancelled = false;
        const ac = new AbortController();
        setDeepSearchLoading(true);

        const runQuery = async (allowWarmRetry: boolean) => {
            const urls = getCompanionBaseUrls();
            const qs = `q=${encodeURIComponent(qTrim)}&provider=${encodeURIComponent(activeProvider)}&limit=60&deep=1`;
            for (const base of urls) {
                if (cancelled) return;
                try {
                    const res = await fetch(`${base}/api/ag-companion/search?${qs}`, {
                        headers: { Authorization: `Bearer ${safeAuthToken}` },
                        signal: ac.signal,
                    });
                    const ctype = (res.headers.get('content-type') || '').toLowerCase();
                    if (!res.ok || !ctype.includes('json')) continue;
                    const doc = await res.json();
                    if (!cancelled && doc?.ok && Array.isArray(doc.results)) {
                        setDeepSearchResults(doc.results as CompanionConversationItem[]);
                        setDeepSearchTotal(Number(doc.totalHits ?? doc.results.length));
                        setDeepSearchWarming(Boolean(doc.warming));
                        if (doc.warming && allowWarmRetry) {
                            window.setTimeout(() => {
                                if (!cancelled) void runQuery(false);
                            }, 550);
                        }
                        return;
                    }
                } catch {
                    // try next base URL
                }
            }
        };

        const tm = window.setTimeout(() => {
            void runQuery(true).finally(() => {
                if (!cancelled) setDeepSearchLoading(false);
            });
        }, 210);

        return () => {
            cancelled = true;
            ac.abort();
            window.clearTimeout(tm);
        };
    }, [activeBackendSearchQuery, activeProvider, safeAuthToken, getCompanionBaseUrls]);

    // In-conversation matching message IDs & jump-to-message helper
    const inConvTokens = useMemo(() => tokenizeVnSearch(inConvSearchQuery), [inConvSearchQuery]);
    const inConvMatchedMsgIds = useMemo(() => {
        if (inConvTokens.length === 0 || !activeConversation?.messages) return [];
        const out: string[] = [];
        for (const msg of activeConversation.messages) {
            const parts = [
                msg.content || '',
                msg.thinking || '',
                msg.errorDetail || '',
                msg.taskFinished?.summary || '',
                msg.taskFinished?.output || '',
                (msg.toolCalls || [])
                    .map(tc => `${tc.name || ''} ${tc.summary || ''} ${tc.command || ''} ${tc.path || ''} ${tc.output || ''}`)
                    .join(' '),
            ];
            if (matchesAllVnTokens(parts.join(' '), inConvTokens)) {
                out.push(msg.id);
            }
        }
        return out;
    }, [activeConversation?.messages, inConvTokens]);

    const jumpToMessageId = useCallback(
        (targetMsgId: string) => {
            const msgs = activeConversation?.messages || [];
            if (!msgs.length || !targetMsgId) return;

            const targetMsg = msgs.find(m => m.id === targetMsgId);
            if (targetMsg) {
                // Auto-expand thinking if match lives inside thinking box
                if (targetMsg.thinking && inConvTokens.length > 0 && matchesAllVnTokens(targetMsg.thinking, inConvTokens)) {
                    setExpandedThinking(prev => (prev[targetMsg.id] ? prev : { ...prev, [targetMsg.id]: true }));
                }
            }

            // Recompute grouped window length so ancient messages become rendered
            let groupIndexEstimate = -1;
            let curWorkSteps: TrajectoryMessage[] = [];
            let gCount = 0;
            const checkFlushWork = () => {
                if (!curWorkSteps.length) return;
                const grpId = `wg_${curWorkSteps[0].id}_${curWorkSteps[curWorkSteps.length - 1].id}`;
                if (curWorkSteps.some(s => s.id === targetMsgId)) {
                    groupIndexEstimate = gCount;
                    setExpandedWorkGroups(prev => (prev[grpId] ? prev : { ...prev, [grpId]: true }));
                }
                curWorkSteps = [];
                gCount += 1;
            };
            for (const m of msgs) {
                if (m.role === 'user') {
                    checkFlushWork();
                    if (m.id === targetMsgId) groupIndexEstimate = gCount;
                    gCount += 1;
                } else if (m.taskFinished || m.isError || ((m.toolCalls?.length || 0) > 0 && Boolean(m.content?.trim())) || (!m.toolCalls?.length && Boolean(m.content?.trim()))) {
                    if ((m.toolCalls?.length || 0) > 0 && Boolean(m.content?.trim())) {
                        curWorkSteps.push({ ...m, id: `${m.id}_work`, content: '' });
                    }
                    checkFlushWork();
                    if (m.id === targetMsgId) groupIndexEstimate = gCount;
                    gCount += 1;
                } else {
                    curWorkSteps.push(m);
                }
            }
            checkFlushWork();

            if (groupIndexEstimate >= 0) {
                const neededFromEnd = Math.max(40, gCount - groupIndexEstimate + 10);
                setVisibleGroupLimit(prev => Math.max(prev, neededFromEnd));
            }

            suppressAutoScrollUntilRef.current = Date.now() + 1800;
            setHighlightedMsgId(targetMsgId);
            window.setTimeout(() => {
                const escaped =
                    typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(targetMsgId) : targetMsgId.replace(/"/g, '\\"');
                const el = document.querySelector(`[data-conv-msg-id="${escaped}"]`) as HTMLElement | null;
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 90);
            window.setTimeout(() => {
                setHighlightedMsgId(prev => (prev === targetMsgId ? null : prev));
            }, 2600);
        },
        [activeConversation?.messages, inConvTokens]
    );

    const stepInConvMatch = useCallback(
        (delta: 1 | -1) => {
            if (inConvMatchedMsgIds.length === 0) return;
            const total = inConvMatchedMsgIds.length;
            const nextPos = ((inConvMatchCursor + delta) % total + total) % total;
            setInConvMatchCursor(nextPos);
            jumpToMessageId(inConvMatchedMsgIds[nextPos]);
        },
        [inConvMatchedMsgIds, inConvMatchCursor, jumpToMessageId]
    );

    useEffect(() => {
        if (pendingJumpMsgId && activeConversation?.messages && activeConversation.messages.length > 0) {
            const exists = activeConversation.messages.some(m => m.id === pendingJumpMsgId);
            if (exists) {
                jumpToMessageId(pendingJumpMsgId);
            }
            setPendingJumpMsgId(null);
        }
    }, [pendingJumpMsgId, activeConversation?.id, activeConversation?.messages, jumpToMessageId]);

    // Ctrl+F / `/` shortcuts inside Giao việc AI
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const onKeyDown = (e: KeyboardEvent) => {
            const activeEl = document.activeElement as HTMLElement | null;
            const isTyping = Boolean(
                activeEl &&
                    (activeEl.tagName === 'TEXTAREA' ||
                        activeEl.tagName === 'INPUT' ||
                        activeEl.tagName === 'SELECT' ||
                        activeEl.isContentEditable)
            );
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && activeConversationId) {
                e.preventDefault();
                setInConvSearchOpen(true);
                window.setTimeout(() => inConvSearchInputRef.current?.focus(), 40);
                return;
            }
            if (!isTyping && e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                setSearchBarOpen(true);
                window.setTimeout(() => sidebarSearchInputRef.current?.focus(), 40);
                return;
            }
            if (e.key === 'Escape' && inConvSearchOpen) {
                e.preventDefault();
                if (activeEl === inConvSearchInputRef.current && inConvSearchQuery) {
                    setInConvSearchQuery('');
                    return;
                }
                setInConvSearchOpen(false);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [activeConversationId, inConvSearchOpen, inConvSearchQuery]);

    // Handle clicking '+ New Conversation' or '+' next to a Project folder
    const handleStartNewInProject = (proj?: CompanionProjectGroup, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (proj) {
            setEffectiveTargetProject(proj.id, proj.name);
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
                provider: activeProvider
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
                            : isAg2
                            ? 'Đã ghim vào Pinned Conversations (Antigravity 2)'
                            : isWin1
                            ? `Đã ghim vào Pinned Conversations (${win1HostName})`
                            : 'Đã ghim vào Pinned Conversations'
                        : 'Đã bỏ ghim hội thoại',
                    'success'
                );
            }
        } catch {
            onToast('Không thể cập nhật trạng thái ghim', 'error');
        }
    };

    const [openingChatGptPc, setOpeningChatGptPc] = useState(false);

    const handleOpenChatGptPc = async (cid: string) => {
        if (!cid || openingChatGptPc) return;
        setOpeningChatGptPc(true);
        try {
            const res = await dispatchCompanionCommand('open-chatgpt-pc', {
                conversationId: cid,
                provider: 'chatgpt'
            });
            if (res && res.ok) {
                onToast('Đã mở phiên trên ChatGPT PC', 'success');
            } else {
                onToast(res?.error || 'Không mở được ChatGPT PC', 'error');
            }
        } catch (err: any) {
            onToast(err?.message || 'Không kết nối được cầu nối PC', 'error');
        } finally {
            setOpeningChatGptPc(false);
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
            if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
                try {
                    const parsed = new URL(rawUrl);
                    const sameOrigin =
                        (typeof window !== 'undefined' && parsed.origin === window.location.origin) ||
                        (originUrl && parsed.origin === new URL(originUrl).origin);
                    if (!sameOrigin) return rawUrl;
                } catch {
                    return rawUrl;
                }
                return safeAuthToken ? `${rawUrl}${sep}key=${encodeURIComponent(safeAuthToken)}` : rawUrl;
            }
            const withKey = safeAuthToken ? `${rawUrl}${sep}key=${encodeURIComponent(safeAuthToken)}` : rawUrl;
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
        if ((!text && mediaToSend.length === 0) || isSubmitting || isSubmittingRef.current) return;
        isSubmittingRef.current = true;

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

        // Case 1: Inside an existing conversation -> send follow-up via SendUserCascadeMessage or queue if busy
        if (activeConversationId && !activeConversationId.startsWith('pending_')) {
            const targetCid = activeConversationId;
            const prevWasRunning = Boolean(activeConversation?.isRunning);
            const prevStatus = activeConversation?.status || 'CASCADE_RUN_STATUS_IDLE';
            const preSendBaseline = capturePreSendBaseline(activeConversation?.messages);
            pendingUserMsgsRef.current[targetCid] = {
                text,
                media: mediaToSend,
                sentAt: nowMs,
                title: activeConversation?.title || autoTitle,
                projectId: activeConversation?.projectId || effectiveTargetProjectId,
                projectName: activeConversation?.projectName || effectiveTargetProjectName,
                ...preSendBaseline
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
            const rollbackOptimisticSend = () => {
                delete pendingUserMsgsRef.current[targetCid];
                setActiveConversation(prev =>
                    prev && prev.id === targetCid
                        ? {
                              ...prev,
                              isRunning: prevWasRunning,
                              status: prevStatus,
                              stepCount: Math.max(0, (prev.stepCount || 1) - 1),
                              messages: prev.messages.filter(m => m.id !== optimisticUserMsg.id)
                          }
                        : prev
                );
                setPromptText(curr => (curr ? curr : text));
                if (mediaToSend.length > 0) {
                    setAttachedMedia(curr => (curr.length > 0 ? curr : mediaToSend));
                }
                isSubmittingRef.current = false;
                setIsSubmitting(false);
            };
            try {
                const res = await dispatchCompanionCommand('send', {
                    cmdId: sendCmdId,
                    provider: activeProvider,
                    conversationId: targetCid,
                    text,
                    media: payloadMedia,
                    model: effectiveSelectedModel.id,
                    app: isChatGPT ? 'chatgpt' : isAg2 ? 'acct2' : isWin1 ? 'win1' : selectedHostId
                });
                if (res && res.ok === true && !res.memberUseCloudStream) {
                    delete manualModelOverrideRef.current[activeProvider];
                    if (res.queued) {
                        delete pendingUserMsgsRef.current[targetCid];
                        const qId = String(res.queueId || sendCmdId);
                        const queuedItem: QueuedPromptItem = {
                            id: qId,
                            cmdId: sendCmdId,
                            content: text,
                            media: res.media || (mediaToSend.length > 0 ? mediaToSend : undefined),
                            model: effectiveSelectedModel.id,
                            status: 'queued',
                            createdAt: nowMs
                        };
                        setActiveConversation(prev => {
                            if (!prev || prev.id !== targetCid) return prev;
                            const existingQ = Array.isArray(prev.queuedPrompts) ? prev.queuedPrompts : [];
                            const hasQ = existingQ.some(q => q.id === qId || (q.cmdId && q.cmdId === sendCmdId));
                            const nextQ = hasQ ? existingQ : [...existingQ, queuedItem];
                            return {
                                ...prev,
                                stepCount: Math.max(0, (prev.stepCount || 1) - 1),
                                messages: prev.messages.filter(m => m.id !== optimisticUserMsg.id),
                                queuedPrompts: nextQ,
                                turnState: {
                                    ...(prev.turnState || { phase: 'running' }),
                                    queuedCount: nextQ.length
                                }
                            };
                        });
                        onToast('Đã xếp hàng prompt chờ lượt hiện tại kết thúc', 'info');
                    } else if (pendingUserMsgsRef.current[targetCid]) {
                        pendingUserMsgsRef.current[targetCid] = {
                            ...pendingUserMsgsRef.current[targetCid],
                            media: res.media || mediaToSend
                        };
                    }
                    isSubmittingRef.current = false;
                    setIsSubmitting(false);
                    fetchOverview(true);
                    setTimeout(() => fetchConversationDetail(targetCid, true), 350);
                    return;
                }
                if (isSystemOwner) {
                    rollbackOptimisticSend();
                    onToast(
                        res?.error ||
                            (isChatGPT
                                ? 'Không gửi được tin nhắn tới ChatGPT PC'
                                : isAg2
                                ? 'Không gửi được tin nhắn tới Antigravity 2 (acct2) trên PC'
                                : isWin1
                                ? `Không gửi được tin nhắn tới ${win1HostName}`
                                : 'Không gửi được tin nhắn tới Antigravity trên PC'),
                        'error'
                    );
                    return;
                }
            } catch (err: any) {
                if (isSystemOwner) {
                    rollbackOptimisticSend();
                    onToast(`Cầu nối PC không phản hồi (đã hủy lệnh chờ để tránh chạy trễ): ${err?.message || 'Timeout'}`, 'error');
                    return;
                }
            } finally {
                if (activePendingCmdIdRef.current === sendCmdId) {
                    activePendingCmdIdRef.current = null;
                }
            }

            if (isSystemOwner) {
                isSubmittingRef.current = false;
                return;
            }
            try {
                await streamViaCloudProxy(text, activeConversation, mediaToSend);
            } finally {
                isSubmittingRef.current = false;
            }
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
        const rollbackOptimisticNew = () => {
            if (activeCidRef.current === pendingCid) {
                activeCidRef.current = null;
            }
            setActiveConversation(prev => (prev && prev.id === pendingCid ? null : prev));
            navigateToConversation(null, true);
            setPromptText(curr => (curr ? curr : text));
            if (mediaToSend.length > 0) {
                setAttachedMedia(curr => (curr.length > 0 ? curr : mediaToSend));
            }
            isSubmittingRef.current = false;
            setIsSubmitting(false);
        };
        try {
            const data = await dispatchCompanionCommand('new', {
                cmdId: newCmdId,
                provider: activeProvider,
                app: isChatGPT ? 'chatgpt' : isAg2 ? 'acct2' : isWin1 ? 'win1' : selectedHostId,
                projectId: effectiveTargetProjectId,
                prompt: text,
                media: payloadMedia,
                model: effectiveSelectedModel.id,
                title: autoTitle
            });
            if (data && data.ok === true && data.conversationId && !data.memberUseCloudStream) {
                delete manualModelOverrideRef.current[activeProvider];
                const newCid = String(data.conversationId);
                pendingUserMsgsRef.current[newCid] = {
                    text,
                    media: data.media || mediaToSend,
                    sentAt: nowMs,
                    title: data.title || autoTitle,
                    projectId: effectiveTargetProjectId,
                    projectName: effectiveTargetProjectName,
                    preSendUserCount: 0
                };
                const realConv: ConversationDetail = {
                    ...optimisticConv,
                    id: newCid,
                    modelId: effectiveSelectedModel.id,
                    title: data.title || autoTitle
                };
                activeCidRef.current = newCid;
                setActiveConversation(realConv);
                navigateToConversation(newCid, true);
                isSubmittingRef.current = false;
                setIsSubmitting(false);
                fetchOverview(true);
                setTimeout(() => fetchConversationDetail(newCid, true), 500);
                return;
            }
            if (isSystemOwner) {
                rollbackOptimisticNew();
                onToast(
                    data?.error ||
                        (isChatGPT
                            ? 'Không tạo được phiên mới trên ChatGPT PC'
                            : isAg2
                            ? 'Không tạo được phiên mới trên Antigravity 2 (acct2)'
                            : isWin1
                            ? `Không tạo được phiên mới trên ${win1HostName}`
                            : 'Không tạo được phiên mới trên Antigravity PC'),
                    'error'
                );
                return;
            }
        } catch (err: any) {
            if (isSystemOwner) {
                rollbackOptimisticNew();
                onToast(`Cầu nối PC không phản hồi (đã hủy lệnh chờ để tránh mở trễ): ${err?.message || 'Timeout'}`, 'error');
                return;
            }
        } finally {
            if (activePendingCmdIdRef.current === newCmdId) {
                activePendingCmdIdRef.current = null;
            }
        }

        if (isSystemOwner) {
            isSubmittingRef.current = false;
            return;
        }
        try {
            await streamViaCloudProxy(text, null, mediaToSend);
        } finally {
            isSubmittingRef.current = false;
        }
    };

    const handleCancelRunning = async () => {
        if (isCancelling) return;
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
        setIsCancelling(true);
        try {
            if (activeConversationId && !activeConversationId.startsWith('local_') && !activeConversationId.startsWith('pending_')) {
                const res = await dispatchCompanionCommand('cancel', {
                    conversationId: activeConversationId,
                    provider: activeProvider,
                    app: isChatGPT ? 'chatgpt' : isAg2 ? 'acct2' : isWin1 ? 'win1' : selectedHostId
                });
                fetchOverview(true);
                await fetchConversationDetail(activeConversationId, true);
                if (res && res.confirmedIdle === false) {
                    onToast(res?.error || 'Chưa xác nhận được lượt cũ đã dừng hẳn, vui lòng thử lại', 'error');
                } else if (res?.dispatchedQueued) {
                    onToast('Đã dừng lượt cũ và bắt đầu chạy prompt đang chờ', 'success');
                } else {
                    onToast('Đã dừng tác vụ và xác nhận phiên rảnh', 'info');
                }
            } else {
                onToast('Đã dừng tác vụ đang chạy', 'info');
            }
        } catch (err: any) {
            onToast(`Không gửi được lệnh dừng: ${err?.message || 'Lỗi kết nối'}`, 'error');
        } finally {
            setIsCancelling(false);
            setIsSubmitting(false);
        }
    };

    const handleCancelQueuedPrompt = async (queueId?: string) => {
        if (!activeConversationId) return;
        try {
            const res = await dispatchCompanionCommand('cancel_queued', {
                conversationId: activeConversationId,
                queueId: queueId || ''
            });
            if (res?.ok) {
                setActiveConversation(prev => {
                    if (!prev || prev.id !== activeConversationId) return prev;
                    const nextQ = (prev.queuedPrompts || []).filter(q => (queueId ? q.id !== queueId : false));
                    return {
                        ...prev,
                        queuedPrompts: nextQ,
                        turnState: prev.turnState ? { ...prev.turnState, queuedCount: nextQ.length } : prev.turnState
                    };
                });
                onToast('Đã hủy prompt đang chờ', 'info');
                fetchOverview(true);
                fetchConversationDetail(activeConversationId, true);
            }
        } catch {
            onToast('Không hủy được prompt đang chờ', 'error');
        }
    };

    const handleCopyCode = (code: string, id: string) => {
        navigator.clipboard?.writeText(code);
        setCopiedCodeId(id);
        setTimeout(() => setCopiedCodeId(null), 1800);
    };

    const openCustomizationsModal = async () => {
        setCustomizationsModalOpen(true);
        const prov = activeProvider;
        if (customData && customData.provider === prov) return;
        setCustomData(null);
        for (const base of getCompanionBaseUrls()) {
            try {
                const r = await fetch(
                    `${base}/api/ag-companion/customizations?provider=${encodeURIComponent(prov)}`,
                    {
                        headers: { Authorization: `Bearer ${safeAuthToken}` },
                        signal: AbortSignal.timeout(4000)
                    }
                );
                if (r.ok) {
                    const d = await r.json();
                    if (d && d.ok) {
                        setCustomData({ ...d, provider: prov });
                        break;
                    }
                }
            } catch {}
        }
    };

    const isUuidLike = (val?: string): boolean =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val || '').trim());

    const formatAiTierBadge = (
        rawTier?: string,
        provider: 'antigravity' | 'antigravity2' | 'win1' | 'chatgpt' = 'antigravity'
    ): string => {
        const t = String(rawTier || '').trim().toUpperCase();
        if (!t) return '';
        if (provider === 'chatgpt') {
            if (t === 'PLUS') return 'ChatGPT Plus';
            if (t === 'PRO') return 'ChatGPT Pro';
            if (t === 'TEAM') return 'ChatGPT Team';
            return t;
        }
        if (t.includes('ULTRA')) return 'Gemini Ultra';
        if (t.includes('PRO')) return 'Gemini Pro';
        if (t.includes('FREE')) return 'Free';
        return t;
    };

    const deriveAccountInitials = (name?: string, email?: string, fallback = 'AI'): string => {
        const n = String(name || '').trim();
        const agMatch = n.match(/\bAG\s*(\d{1,2})\b/i);
        if (agMatch) {
            return `A${agMatch[1]}`.slice(0, 3).toUpperCase();
        }
        const cleaned = n.replace(/[^A-Za-z0-9]/g, '');
        if (cleaned.length >= 2) return cleaned.slice(0, 2).toUpperCase();
        if (cleaned.length === 1) return cleaned.toUpperCase();
        const em = String(email || '')
            .trim()
            .split('@')[0]
            .replace(/[^A-Za-z0-9]/g, '');
        if (em.length >= 2) return em.slice(0, 2).toUpperCase();
        return fallback.slice(0, 2).toUpperCase();
    };

    const findMatchedPortalAccount = useCallback(
        (id?: string, email?: string) => {
            if (!Array.isArray(permittedAccounts) || permittedAccounts.length === 0) return null;
            const normEmail = String(email || '').trim().toLowerCase();
            const normId = String(id || '').trim();
            return (
                permittedAccounts.find((a: any) => {
                    const ae = String(a?.email || '').trim().toLowerCase();
                    if (normEmail && ae && ae === normEmail) return true;
                    return Boolean(normId && a?.id && String(a.id).trim() === normId);
                }) || null
            );
        },
        [permittedAccounts]
    );

    const avatarInitials = (member.username || 'vu').slice(0, 2).toLowerCase();
    const resolvedActiveAgAccount = useMemo(() => {
        if (isSystemOwner && pcActiveAgAccount && (pcActiveAgAccount.email || pcActiveAgAccount.name || pcActiveAgAccount.id)) {
            const portalMatch = findMatchedPortalAccount(pcActiveAgAccount.id, pcActiveAgAccount.email);
            const email = String(pcActiveAgAccount.email || portalMatch?.email || '').trim();
            const rawBridgeName = !isUuidLike(pcActiveAgAccount.name) ? String(pcActiveAgAccount.name || '').trim() : '';
            const name = String(
                portalMatch?.custom_label || rawBridgeName || portalMatch?.name || (email ? email.split('@')[0] : '')
            ).trim();
            let tier = String(
                pcActiveAgAccount.tier || portalMatch?.subscription_tier || portalMatch?.quota?.subscription_tier || ''
            )
                .trim()
                .toUpperCase();
            if (!tier && /\bULTRA\b/i.test(name)) tier = 'ULTRA';
            if (email || name) {
                return {
                    id: String(pcActiveAgAccount.id || portalMatch?.id || ''),
                    email,
                    name: name || email,
                    tier,
                    source: pcActiveAgAccount.source || 'Live PC'
                };
            }
        }
        const curPortalAcc = Array.isArray(permittedAccounts)
            ? permittedAccounts.find((a: any) => a?.is_current)
            : null;
        if (curPortalAcc) {
            const name = String(curPortalAcc.custom_label || curPortalAcc.name || '').trim();
            let tier = String(
                curPortalAcc.subscription_tier || curPortalAcc.quota?.subscription_tier || ''
            )
                .trim()
                .toUpperCase();
            if (!tier && /\bULTRA\b/i.test(name)) tier = 'ULTRA';
            return {
                id: curPortalAcc.id || '',
                email: curPortalAcc.email || '',
                name,
                tier,
                source: 'Kho AIHOT'
            };
        }
        return null;
    }, [isSystemOwner, pcActiveAgAccount, permittedAccounts, findMatchedPortalAccount]);

    const resolvedActiveAg2Account = useMemo(() => {
        if (isSystemOwner && pcActiveAg2Account && (pcActiveAg2Account.email || pcActiveAg2Account.name || pcActiveAg2Account.id)) {
            const portalMatch = findMatchedPortalAccount(pcActiveAg2Account.id, pcActiveAg2Account.email);
            const email = String(pcActiveAg2Account.email || portalMatch?.email || '').trim();
            const rawBridgeName = !isUuidLike(pcActiveAg2Account.name) ? String(pcActiveAg2Account.name || '').trim() : '';
            const name = String(
                portalMatch?.custom_label || rawBridgeName || portalMatch?.name || (email ? email.split('@')[0] : '')
            ).trim();
            let tier = String(
                pcActiveAg2Account.tier || portalMatch?.subscription_tier || portalMatch?.quota?.subscription_tier || ''
            )
                .trim()
                .toUpperCase();
            if (!tier && /\bULTRA\b/i.test(name)) tier = 'ULTRA';
            return {
                id: String(pcActiveAg2Account.id || portalMatch?.id || ''),
                email,
                name: name || email,
                tier,
                source: pcActiveAg2Account.source || 'WinCred acct2',
                online: Boolean(pcActiveAg2Account.online)
            };
        }
        return null;
    }, [isSystemOwner, pcActiveAg2Account, findMatchedPortalAccount]);

    const resolvedActiveWin1Account = useMemo(() => {
        if (
            isSystemOwner &&
            pcActiveWin1Account &&
            (pcActiveWin1Account.email || pcActiveWin1Account.name || pcActiveWin1Account.id || win1Online)
        ) {
            const portalMatch = findMatchedPortalAccount(pcActiveWin1Account.id, pcActiveWin1Account.email);
            const email = String(pcActiveWin1Account.email || portalMatch?.email || '').trim();
            const rawBridgeName = !isUuidLike(pcActiveWin1Account.name) ? String(pcActiveWin1Account.name || '').trim() : '';
            const name = String(
                portalMatch?.custom_label || rawBridgeName || portalMatch?.name || (email ? email.split('@')[0] : '') || win1HostName
            ).trim();
            let tier = String(
                pcActiveWin1Account.tier || portalMatch?.subscription_tier || portalMatch?.quota?.subscription_tier || ''
            )
                .trim()
                .toUpperCase();
            if (!tier && /\bULTRA\b/i.test(name)) tier = 'ULTRA';
            return {
                id: String(pcActiveWin1Account.id || portalMatch?.id || 'win1'),
                email,
                name: name || win1HostName,
                tier,
                source: pcActiveWin1Account.source || `${win1HostName} (@win1)`,
                online: Boolean(pcActiveWin1Account.online ?? win1Online)
            };
        }
        return null;
    }, [isSystemOwner, pcActiveWin1Account, win1Online, win1HostName, findMatchedPortalAccount]);

    const resolvedActiveChatgptAccount = useMemo(() => {
        if (
            isSystemOwner &&
            pcActiveChatgptAccount &&
            (pcActiveChatgptAccount.email || pcActiveChatgptAccount.accountId)
        ) {
            return {
                accountId: pcActiveChatgptAccount.accountId || '',
                email: pcActiveChatgptAccount.email || '',
                name: pcActiveChatgptAccount.name || '',
                planType: (pcActiveChatgptAccount.planType || chatgptQuota?.planType || '').toUpperCase(),
                source: pcActiveChatgptAccount.source || 'Live PC (.codex)'
            };
        }
        if (chatgptQuota?.planType) {
            return {
                accountId: '',
                email: '',
                name: 'ChatGPT PC',
                planType: String(chatgptQuota.planType).toUpperCase(),
                source: 'Codex PC'
            };
        }
        return null;
    }, [isSystemOwner, pcActiveChatgptAccount, chatgptQuota]);

    const formatLoginEmail = useCallback(
        (rawEmail?: string) => {
            const val = String(rawEmail || '').trim();
            if (!val) return '';
            if (isSystemOwner && showAccountEmails) return val;
            return maskEmailAddress(val, true);
        },
        [isSystemOwner, showAccountEmails]
    );

    const toggleAccountEmailMask = useCallback(() => {
        setShowAccountEmails(prev => {
            const next = !prev;
            setEmailMaskEnabled(!next);
            return next;
        });
    }, []);

    const roleDisplayLabel = useMemo(() => {
        const r = String(member.role || 'member').toLowerCase();
        if (r === 'admin' || isSystemOwner) return 'Admin';
        if (r === 'guest') return 'Khách';
        return 'Thành viên';
    }, [member.role, isSystemOwner]);

    const resolvedHeaderAccount = useMemo(() => {
        const buildHeaderIdentity = (
            providerLabel: string,
            rawName: string,
            rawEmail: string,
            rawTier: string,
            provider: 'antigravity' | 'antigravity2' | 'win1' | 'chatgpt',
            fallbackName: string,
            fallbackInitials: string,
            fallbackBadge: string
        ) => {
            const email = String(rawEmail || '').trim();
            const formattedEmail = email ? formatLoginEmail(email) : '';
            const displayName = String(rawName || '').trim() || formattedEmail || fallbackName;
            const showSeparateEmail = Boolean(
                formattedEmail &&
                    displayName.toLowerCase() !== formattedEmail.toLowerCase() &&
                    displayName.toLowerCase() !== email.toLowerCase()
            );
            const tierUpper = String(rawTier || '').trim().toUpperCase();
            const tierBadge = formatAiTierBadge(tierUpper, provider) || fallbackBadge;
            const isUltra = tierUpper.includes('ULTRA');
            const avatarBgClass =
                provider === 'chatgpt'
                    ? 'bg-[#10a37f]'
                    : provider === 'win1'
                    ? 'bg-[#0891b2]'
                    : provider === 'antigravity2'
                    ? isUltra
                        ? 'bg-[#6d28d9]'
                        : 'bg-[#004d40]'
                    : isUltra
                    ? 'bg-[#4f46e5]'
                    : 'bg-[#004d40]';
            const badgeClass =
                provider === 'chatgpt'
                    ? 'bg-[#e6f7f1] text-[#0b7a5d]'
                    : provider === 'win1'
                    ? 'bg-[#e0f2fe] text-[#0369a1]'
                    : provider === 'antigravity2'
                    ? isUltra
                        ? 'bg-[#f3e8ff] text-[#6d28d9]'
                        : 'bg-[#eef4ff] text-[#1967d2]'
                    : isUltra
                    ? 'bg-[#eef2ff] text-[#4338ca]'
                    : 'bg-[#eef4ff] text-[#1967d2]';

            return {
                providerLabel,
                displayName,
                email,
                formattedEmail,
                showSeparateEmail,
                tier: tierUpper,
                tierBadge,
                initials: deriveAccountInitials(rawName, email, fallbackInitials),
                avatarBgClass,
                badgeClass
            };
        };

        if (activeProvider === 'chatgpt') {
            if (!resolvedActiveChatgptAccount) return null;
            return buildHeaderIdentity(
                'ChatGPT PC',
                resolvedActiveChatgptAccount.name || '',
                resolvedActiveChatgptAccount.email || '',
                resolvedActiveChatgptAccount.planType || '',
                'chatgpt',
                'ChatGPT PC',
                'CG',
                'ChatGPT'
            );
        }
        if (activeProvider === 'antigravity2') {
            if (!resolvedActiveAg2Account) return null;
            return buildHeaderIdentity(
                'AG2 · Antigravity 2',
                resolvedActiveAg2Account.name || '',
                resolvedActiveAg2Account.email || '',
                resolvedActiveAg2Account.tier || '',
                'antigravity2',
                'AG2 · Antigravity 2',
                'A2',
                'AG 2'
            );
        }
        if (activeProvider === 'win1') {
            if (!resolvedActiveWin1Account) return null;
            return buildHeaderIdentity(
                `AG3 · ${win1HostName}`,
                resolvedActiveWin1Account.name || win1HostName,
                resolvedActiveWin1Account.email || '',
                resolvedActiveWin1Account.tier || '',
                'win1',
                `AG3 · ${win1HostName}`,
                'A3',
                'AG 3'
            );
        }
        if (!resolvedActiveAgAccount) return null;
        return buildHeaderIdentity(
            'AG1 · Antigravity',
            resolvedActiveAgAccount.name || '',
            resolvedActiveAgAccount.email || '',
            resolvedActiveAgAccount.tier || '',
            'antigravity',
            'AG1 · Antigravity',
            'A1',
            'AG 1'
        );
    }, [
        activeProvider,
        resolvedActiveAgAccount,
        resolvedActiveAg2Account,
        resolvedActiveWin1Account,
        win1HostName,
        resolvedActiveChatgptAccount,
        formatLoginEmail
    ]);

    const headerAccountTooltip = useMemo(() => {
        if (!resolvedHeaderAccount) {
            return `Đang đăng nhập: ${member.display_name || member.username} (@${member.username})`;
        }
        const masked = resolvedHeaderAccount.email ? formatLoginEmail(resolvedHeaderAccount.email) : '';
        const parts = [
            `${resolvedHeaderAccount.providerLabel}: ${resolvedHeaderAccount.displayName}`,
            masked,
            resolvedHeaderAccount.tierBadge,
            `Portal: @${member.username}`
        ].filter(Boolean);
        return `${parts.join(' · ')} · Bấm để xem chi tiết`;
    }, [resolvedHeaderAccount, member.display_name, member.username, formatLoginEmail]);

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
            return inConvSearchQuery.trim() ? (
                <HighlightText
                    key={i}
                    text={part}
                    query={inConvSearchQuery}
                    markClassName={isLight ? undefined : 'bg-amber-400/35 text-[#fff3cd] rounded px-0.5 font-semibold'}
                />
            ) : (
                part
            );
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
        const isMsgHighlighted = highlightedMsgId === msg.id;
        return (
            <div
                key={`step_body_${msg.id}`}
                data-conv-msg-id={msg.id}
                className={`space-y-2.5 rounded-xl transition-all ${
                    isMsgHighlighted ? 'ring-2 ring-amber-400/90 bg-amber-400/10 p-2 -mx-2' : ''
                }`}
            >
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
                {msg.isError ? (
                    <div
                        className={`rounded-xl border px-3.5 py-2.5 space-y-1 ${
                            isLight
                                ? 'bg-[#fff8f7] border-[#f5c2c0] text-[#3c4043]'
                                : 'bg-[#2a1f1f]/70 border-[#5c3232] text-[#e8eaed]'
                        }`}
                    >
                        <div
                            onClick={() => {
                                if (!msg.errorDetail) return;
                                if (typeof window !== 'undefined' && window.getSelection()?.toString()) return;
                                setExpandedThinking(prev => ({
                                    ...prev,
                                    [`err_${msg.id}`]: !prev[`err_${msg.id}`]
                                }));
                            }}
                            className={`w-full flex items-start justify-between gap-2 text-left text-[13.5px] leading-snug select-text ${
                                msg.errorDetail ? 'cursor-pointer' : ''
                            }`}
                        >
                            <span className="break-words select-text">
                                <strong className={isLight ? 'text-[#c5221f]' : 'text-[#f28b82]'}>Lỗi </strong>
                                {maskEmailsInText(msg.content)}
                            </span>
                            {msg.errorDetail && (
                                <button
                                    type="button"
                                    aria-label={expandedThinking[`err_${msg.id}`] ? 'Ẩn chi tiết lỗi' : 'Xem chi tiết lỗi'}
                                    onClick={e => {
                                        e.stopPropagation();
                                        setExpandedThinking(prev => ({
                                            ...prev,
                                            [`err_${msg.id}`]: !prev[`err_${msg.id}`]
                                        }));
                                    }}
                                    className="p-0.5 rounded hover:bg-black/5 shrink-0 select-none"
                                >
                                    <ChevronRight
                                        className={`w-3.5 h-3.5 mt-0.5 opacity-70 transition-transform ${
                                            expandedThinking[`err_${msg.id}`] ? 'rotate-90' : ''
                                        }`}
                                    />
                                </button>
                            )}
                        </div>
                        {msg.errorCode && (
                            <div
                                className={`text-[12px] font-mono break-all ${
                                    isLight ? 'text-[#5f6368]' : 'text-[#9aa0a6]'
                                }`}
                            >
                                Mã lỗi: {msg.errorCode}
                            </div>
                        )}
                        {msg.errorDetail && expandedThinking[`err_${msg.id}`] && (
                            <pre
                                className={`mt-1.5 pt-1.5 border-t text-[12px] font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto ${
                                    isLight
                                        ? 'border-[#f1d3d1] text-[#5f6368]'
                                        : 'border-[#4a2a2a] text-[#bdc1c6]'
                                }`}
                            >
                                {maskEmailsInText(msg.errorDetail)}
                            </pre>
                        )}
                    </div>
                ) : (
                    msg.content && (
                        <div className="pl-0.5">{renderFormattedContent(msg.content, msg.id, isLight)}</div>
                    )
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
            if (msg.isError) {
                flushWork(msg.timestamp);
                items.push({ kind: 'assistant', id: msg.id, msg });
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
                const isUserHighlighted = highlightedMsgId === item.id;
                return (
                    <div
                        key={`${isLight ? 'desk' : 'mob'}_u_${item.id}`}
                        data-conv-msg-id={item.id}
                        className="flex justify-end"
                    >
                        <div
                            className={`${
                                isLight
                                    ? 'max-w-[82%] rounded-2xl bg-[#f3f3f1] border border-[#dfdfd8] px-4 py-2.5 text-[14.5px] text-[#1f1f1f] leading-relaxed whitespace-pre-wrap break-words'
                                    : 'max-w-[88%] rounded-2xl bg-[#2b2b2b] border border-[#3a3a3a] px-4 py-3 text-[15px] text-[#e3e3e3] leading-relaxed whitespace-pre-wrap break-words'
                            } ${isUserHighlighted ? 'ring-2 ring-amber-400 shadow-lg' : ''}`}
                        >
                            {renderMessageMedia(item.msg, isLight)}
                            {item.msg.content ? (
                                <HighlightText
                                    text={maskEmailsInText(item.msg.content)}
                                    query={inConvSearchQuery}
                                    markClassName={isLight ? undefined : 'bg-amber-400/35 text-[#fff3cd] rounded px-0.5 font-semibold'}
                                />
                            ) : null}
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

    const renderTurnStatusAndQueuedCards = (isLight: boolean) => {
        const turnState = activeConversation?.turnState;
        const queuedPrompts = activeConversation?.queuedPrompts || [];
        const phase = turnState?.phase || (activeConversation?.isRunning ? 'running' : 'idle');
        const showRetryBanner = phase === 'retrying' || phase === 'cancelling' || isCancelling;
        const convMsgs = activeConversation?.messages || [];
        const errTextNorm = String(activeConversation?.errorMessage || '').trim();
        const alreadyRenderedInRecentMsgs = convMsgs.slice(-5).some(
            m =>
                Boolean(m?.isError) &&
                (m.errorCode === 'STREAM_RETRY_EXHAUSTED' ||
                    (errTextNorm && String(m.content || '').trim() === errTextNorm))
        );
        const showErrorBanner = Boolean(
            activeConversation?.hasError &&
                errTextNorm &&
                !alreadyRenderedInRecentMsgs &&
                phase !== 'retrying' &&
                !activeConversation?.isRunning
        );
        if (!showRetryBanner && !showErrorBanner && queuedPrompts.length === 0) {
            return null;
        }
        const retryAttempt = Math.max(1, Number(turnState?.retryAttempt || 1));
        const maxRetries = Math.max(1, Number(turnState?.maxRetries || 2));

        return (
            <div className="space-y-3 mt-3" data-testid="turn-resilience-panel">
                {showRetryBanner && (
                    <div
                        data-testid="turn-state-card"
                        className={`rounded-2xl border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs ${
                            isLight
                                ? 'bg-[#fef7e0] border-[#f9ab00]/40 text-[#5f4300]'
                                : 'bg-[#2a2315] border-[#fbbc04]/35 text-[#fde293]'
                        }`}
                    >
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                            {isCancelling || phase === 'cancelling' ? (
                                <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5" />
                            ) : (
                                <RefreshCw className="w-4 h-4 animate-spin shrink-0 mt-0.5" />
                            )}
                            <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="font-semibold tabular-nums flex flex-wrap items-center gap-1.5">
                                    <span>
                                        {isCancelling || phase === 'cancelling'
                                            ? 'Đang dừng lượt chạy cũ và xác nhận trạng thái IDLE...'
                                            : `Đang thử lại phản hồi (lần ${retryAttempt}/${maxRetries})`}
                                    </span>
                                    {queuedPrompts.length > 0 && (
                                        <span
                                            className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium tabular-nums ${
                                                isLight
                                                    ? 'bg-[#e8f0fe] text-[#174ea6]'
                                                    : 'bg-[#1f324d] text-[#a8c7fa]'
                                            }`}
                                        >
                                            +{queuedPrompts.length} đang chờ
                                        </span>
                                    )}
                                </div>
                                {turnState?.lastError && (
                                    <div
                                        className={`text-xs break-words line-clamp-2 ${
                                            isLight ? 'text-[#7a5800]' : 'text-[#f6cf65]'
                                        }`}
                                    >
                                        {turnState.lastError}
                                    </div>
                                )}
                            </div>
                        </div>
                        <button
                            type="button"
                            onMouseDown={e => e.preventDefault()}
                            onClick={handleCancelRunning}
                            disabled={isCancelling}
                            data-testid="turn-state-stop-btn"
                            className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-60 ${
                                isLight
                                    ? 'bg-[#fce8e6] hover:bg-[#f9d6d2] text-[#c5221f] border border-[#f2b8b5]'
                                    : 'bg-[#3c2020] hover:bg-[#4e2828] text-[#f6aea9] border border-[#6c3434]'
                            }`}
                        >
                            <Square className="w-3 h-3 fill-current" />
                            <span>{queuedPrompts.length > 0 ? 'Dừng & chạy prompt chờ' : 'Dừng'}</span>
                        </button>
                    </div>
                )}

                {showErrorBanner && (
                    <div
                        data-testid="turn-error-card"
                        className={`rounded-2xl border px-3.5 py-2.5 flex items-start gap-2 text-xs ${
                            isLight
                                ? 'bg-[#fce8e6] border-[#f2b8b5] text-[#a50e0e]'
                                : 'bg-[#361d1d] border-[#6e3333] text-[#f6aea9]'
                        }`}
                    >
                        <MessageSquareWarning className="w-4 h-4 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1 break-words">{activeConversation?.errorMessage}</div>
                    </div>
                )}

                {queuedPrompts.map((qp, idx) => (
                    <div
                        key={`queued_${qp.id}`}
                        data-testid="queued-prompt-card"
                        className={`rounded-2xl border px-3.5 py-2.5 space-y-1.5 ${
                            isLight
                                ? 'bg-[#f4f7fc] border-[#c6dafc] text-[#1f1f1f]'
                                : 'bg-[#202630] border-[#384963] text-[#e3e3e3]'
                        }`}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <div
                                className={`inline-flex items-center gap-1.5 text-xs font-medium tabular-nums ${
                                    isLight ? 'text-[#174ea6]' : 'text-[#8ab4f8]'
                                }`}
                            >
                                <Clock className="w-3.5 h-3.5 shrink-0" />
                                <span>Đang chờ lượt cũ kết thúc (#{idx + 1})</span>
                            </div>
                            <button
                                type="button"
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => handleCancelQueuedPrompt(qp.id)}
                                title="Hủy prompt đang chờ"
                                aria-label="Hủy prompt đang chờ"
                                data-testid="cancel-queued-prompt-btn"
                                className={`p-1 rounded-full transition-colors ${
                                    isLight
                                        ? 'text-[#5f6368] hover:text-[#c5221f] hover:bg-black/[0.06]'
                                        : 'text-[#9aa0a6] hover:text-[#f28b82] hover:bg-white/[0.08]'
                                }`}
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        {qp.content && (
                            <div className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">
                                {qp.content}
                            </div>
                        )}
                        {qp.media && qp.media.length > 0 && (
                            <div className="pt-1">
                                {renderMessageMedia(
                                    {
                                        id: qp.id,
                                        role: 'user',
                                        content: '',
                                        timestamp: qp.createdAt || Date.now(),
                                        media: qp.media
                                    },
                                    isLight
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    };


    // Filter conversations using Vietnamese diacritics-insensitive + multi-token ranking
    const searchTokens = useMemo(() => tokenizeVnSearch(searchQuery), [searchQuery]);
    const filterConvList = (list: CompanionConversationItem[]) => {
        const filtered = list.filter(item => {
            if (filterUnreadOnly && !item.unread && !item.isRunning) return false;
            if (searchTokens.length > 0) {
                return matchesAllVnTokens(
                    `${item.title} ${item.projectName} ${item.workspaceTag || ''} ${item.snippet || ''}`,
                    searchTokens
                );
            }
            return true;
        });
        if (searchTokens.length === 0) return filtered;
        return [...filtered].sort((a, b) => {
            const sa = scoreVnSearchFields(
                { title: a.title, project: `${a.projectName} ${a.workspaceTag || ''}`, preview: a.snippet },
                searchTokens
            );
            const sb = scoreVnSearchFields(
                { title: b.title, project: `${b.projectName} ${b.workspaceTag || ''}`, preview: b.snippet },
                searchTokens
            );
            if (sb !== sa) return sb - sa;
            return (b.lastModifiedEpoch || 0) - (a.lastModifiedEpoch || 0);
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
                                setEffectiveTargetProject(p.id, p.name);
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
                            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
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
                                                        setEffectiveSelectedModel(m);
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
                                                        <span
                                                            className={`text-xs tabular-nums ${
                                                                pct <= 0
                                                                    ? 'text-[#d93025] font-semibold'
                                                                    : pct <= 15
                                                                    ? 'text-[#e37400] font-medium'
                                                                    : 'text-[#787878]'
                                                            }`}
                                                        >
                                                            {pct <= 0 ? 'Hết quota (0%)' : `${pct}%`}
                                                        </span>
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

                            {(isSubmitting ||
                                isCancelling ||
                                activeConversation?.isRunning ||
                                activeConversation?.turnState?.phase === 'retrying' ||
                                activeConversation?.turnState?.phase === 'cancelling') && (
                                <button
                                    type="button"
                                    onClick={handleCancelRunning}
                                    disabled={isCancelling}
                                    title="Dừng lượt đang chạy"
                                    data-testid="desktop-stop-btn"
                                    className="w-7 h-7 rounded-full bg-[#fce8e6] hover:bg-[#f8d7da] text-[#d93025] flex items-center justify-center transition-all disabled:opacity-60"
                                >
                                    <Square className="w-3 h-3 fill-current" />
                                </button>
                            )}

                            {(promptText.trim() ||
                                attachedMedia.length > 0 ||
                                !(
                                    isSubmitting ||
                                    isCancelling ||
                                    activeConversation?.isRunning ||
                                    activeConversation?.turnState?.phase === 'retrying' ||
                                    activeConversation?.turnState?.phase === 'cancelling'
                                )) && (
                                <button
                                    type="button"
                                    onClick={handleSubmitPrompt}
                                    disabled={isSubmitting || (!promptText.trim() && attachedMedia.length === 0)}
                                    title={
                                        activeConversation?.isRunning ||
                                        activeConversation?.turnState?.phase === 'retrying'
                                            ? 'Đưa vào hàng chờ'
                                            : 'Submit'
                                    }
                                    data-testid="desktop-submit-btn"
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
        visibleGroupLimit,
        inConvSearchQuery,
        highlightedMsgId
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
        visibleGroupLimit,
        inConvSearchQuery,
        highlightedMsgId
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

    const searchActive = searchTokens.length > 0;

    const renderInConvSearchBar = (isLight: boolean) => {
        if (!inConvSearchOpen && !inConvSearchQuery.trim()) return null;
        return (
            <div
                className={`px-3.5 py-2 border-b flex items-center gap-2 text-xs tabular-nums shrink-0 ${
                    isLight
                        ? 'bg-[#fcfcfb] border-[#e6e6e4] text-[#1f1f1f]'
                        : 'bg-[#171816] border-[#2c2d2a] text-[#e3e3e3]'
                }`}
            >
                <Search className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-[#5f6368]' : 'text-[#9e9e9e]'}`} />
                <input
                    ref={inConvSearchInputRef}
                    type="text"
                    value={inConvSearchQuery}
                    onChange={e => {
                        setInConvSearchQuery(e.target.value);
                        setInConvMatchCursor(0);
                    }}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            stepInConvMatch(e.shiftKey ? -1 : 1);
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (inConvSearchQuery) setInConvSearchQuery('');
                            else setInConvSearchOpen(false);
                        }
                    }}
                    placeholder="Tìm không dấu trong hội thoại này (Ctrl+F)..."
                    className={`flex-1 min-w-0 bg-transparent text-xs outline-none ${
                        isLight ? 'placeholder-[#8e8e8e] text-[#1f1f1f]' : 'placeholder-[#8e8e8e] text-[#e3e3e3]'
                    }`}
                />
                {inConvSearchQuery && (
                    <button
                        type="button"
                        onClick={() => setInConvSearchQuery('')}
                        aria-label="Xóa từ khóa tìm trong hội thoại"
                        className={isLight ? 'text-[#787878] hover:text-[#1f1f1f]' : 'text-[#9e9e9e] hover:text-white'}
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
                {inConvTokens.length > 0 && (
                    <span className={`font-semibold shrink-0 ${isLight ? 'text-[#5f6368]' : 'text-[#9e9e9e]'}`}>
                        {inConvMatchedMsgIds.length > 0
                            ? `${(inConvMatchCursor % inConvMatchedMsgIds.length) + 1}/${inConvMatchedMsgIds.length}`
                            : '0/0'}
                    </span>
                )}
                <button
                    type="button"
                    disabled={inConvMatchedMsgIds.length === 0}
                    onClick={() => stepInConvMatch(-1)}
                    aria-label="Kết quả trước"
                    className={`p-1 rounded border disabled:opacity-40 cursor-pointer ${
                        isLight ? 'border-[#dfdfd8] hover:bg-black/[0.04]' : 'border-[#3a3b38] hover:bg-white/[0.06]'
                    }`}
                >
                    <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                    type="button"
                    disabled={inConvMatchedMsgIds.length === 0}
                    onClick={() => stepInConvMatch(1)}
                    aria-label="Kết quả tiếp theo"
                    className={`p-1 rounded border disabled:opacity-40 cursor-pointer ${
                        isLight ? 'border-[#dfdfd8] hover:bg-black/[0.04]' : 'border-[#3a3b38] hover:bg-white/[0.06]'
                    }`}
                >
                    <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setInConvSearchQuery('');
                        setInConvSearchOpen(false);
                    }}
                    aria-label="Đóng tìm trong hội thoại"
                    className={`p-1 rounded cursor-pointer ${
                        isLight ? 'text-[#787878] hover:text-[#1f1f1f]' : 'text-[#9e9e9e] hover:text-white'
                    }`}
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        );
    };

    const renderDeepSearchResultsBlock = (isLight: boolean) => {
        if (!searchActive || searchQuery.trim().length < 2) return null;
        return (
            <div className="mb-3 space-y-1.5">
                <div
                    className={`px-1.5 flex items-center justify-between gap-2 text-xs font-medium ${
                        isLight ? 'text-[#5f6368]' : 'text-[#9e9e9e]'
                    }`}
                >
                    <span className="inline-flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span>
                            {deepSearchLoading
                                ? 'Đang tìm toàn văn trên PC...'
                                : deepSearchWarming
                                  ? `Đang lập chỉ mục sâu · ${deepSearchResults.length} khớp`
                                  : `Tìm toàn lịch sử & nội dung (${deepSearchTotal})`}
                        </span>
                    </span>
                </div>
                {deepSearchResults.length > 0 && (
                    <div className="space-y-1">
                        {deepSearchResults.slice(0, 20).map(conv => {
                            const isActive = activeConversationId === conv.id;
                            return (
                                <button
                                    key={`deep_${isLight ? 'd' : 'm'}_${conv.id}`}
                                    type="button"
                                    onClick={() => handleOpenConversation(conv)}
                                    className={`w-full text-left px-2.5 py-2 rounded-[9px] border transition-colors cursor-pointer space-y-1 ${
                                        isLight
                                            ? isActive
                                                ? 'bg-[#e3e3e0] border-[#cfcfc8] text-[#111111]'
                                                : 'bg-white/80 hover:bg-white border-[#e6e6e4] text-[#1f1f1f]'
                                            : isActive
                                              ? 'bg-[#2a2b28] border-[#4a4b47] text-white'
                                              : 'bg-[#252624]/80 hover:bg-[#2a2b28] border-[#343532] text-[#e3e3e3]'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="text-xs font-semibold leading-snug line-clamp-2 break-words">
                                            <HighlightText
                                                text={maskEmailsInText(conv.title)}
                                                query={searchQuery}
                                                markClassName={isLight ? undefined : 'bg-amber-400/35 text-[#fff3cd] rounded px-0.5 font-semibold'}
                                            />
                                        </span>
                                        <span className={`text-xs shrink-0 tabular-nums ${isLight ? 'text-[#787878]' : 'text-[#8e8e8e]'}`}>
                                            {conv.relativeTime}
                                        </span>
                                    </div>
                                    {conv.snippet && (
                                        <div className={`text-xs leading-snug line-clamp-2 break-words ${isLight ? 'text-[#5f6368]' : 'text-[#b0b0b0]'}`}>
                                            <HighlightText
                                                text={maskEmailsInText(conv.snippet)}
                                                query={searchQuery}
                                                markClassName={isLight ? undefined : 'bg-amber-400/35 text-[#fff3cd] rounded px-0.5 font-semibold'}
                                            />
                                        </div>
                                    )}
                                    <div className={`flex items-center justify-between gap-2 text-xs ${isLight ? 'text-[#787878]' : 'text-[#8e8e8e]'}`}>
                                        <span className="inline-flex items-center gap-1 truncate">
                                            <Folder className="w-3 h-3 shrink-0" />
                                            <span className="truncate">{conv.projectName}</span>
                                        </span>
                                        {conv.matchedMsgId && (
                                            <span className={`${isLight ? 'text-[#1967d2]' : 'text-[#8ab4f8]'} font-semibold shrink-0`}>
                                                Nhảy tới tin khớp →
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        );
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
            className={`w-full font-sans flex flex-col overflow-hidden ${
                isMobileViewport
                    ? 'fixed left-0 right-0 z-[45] bg-[#1e1f1c] rounded-none border-0 shadow-none'
                    : 'flex-1 min-h-0 h-full md:h-[calc(100dvh-28px)] lg:h-[calc(100dvh-142px)] md:min-h-[420px] bg-[#1e1f1c] md:bg-transparent rounded-none md:rounded-2xl border-0 md:border md:border-[#e3e3e0] shadow-none md:shadow-xs relative'
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
            <div className="hidden md:flex shrink-0 px-3 py-1.5 bg-[#f1f1ef] border-b border-[#e3e3e0] items-center justify-between gap-2 z-30 select-none">
                <div className="grid grid-cols-2 md:flex items-center gap-1.5 w-full md:w-auto">
                    <button
                        type="button"
                        onClick={() => handleSwitchProvider('antigravity')}
                        className={`justify-center px-3 py-1.5 md:py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                            activeProvider === 'antigravity'
                                ? 'bg-[#2a2a2a] text-white border border-[#444] md:bg-white md:text-[#111111] shadow-xs md:border-[#d8d8d4]'
                                : 'text-[#9e9e9e] hover:text-white md:text-[#5f6368] md:hover:text-[#1f1f1f] hover:bg-white/5 md:hover:bg-black/[0.04]'
                        }`}
                    >
                        <AntigravityRibbonLogo className="w-4 h-4 shrink-0" />
                        <span>AG1 · ANTIGRAVITY</span>
                        <span
                            className={`px-1.5 py-0.2 rounded-full text-xs font-semibold tabular-nums ${
                                activeProvider === 'antigravity'
                                    ? 'bg-[#8ab4f8]/20 text-[#8ab4f8] md:bg-[#e8f0fe] md:text-[#1967d2]'
                                    : 'bg-white/10 text-[#9e9e9e] md:bg-black/[0.06] md:text-[#6e6e6e]'
                            }`}
                        >
                            {projects.reduce((acc, p) => acc + (p.totalCount || 0), 0)}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => handleSwitchProvider('antigravity2')}
                        className={`justify-center px-3 py-1.5 md:py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                            isAg2
                                ? 'bg-[#7c3aed] text-white border border-[#7c3aed] md:bg-[#6d28d9] md:border-[#6d28d9] shadow-xs'
                                : 'text-[#9e9e9e] hover:text-white md:text-[#5f6368] md:hover:text-[#1f1f1f] hover:bg-white/5 md:hover:bg-black/[0.04]'
                        }`}
                    >
                        <AntigravityRibbonLogo className="w-4 h-4 shrink-0" />
                        <span>AG2 · ANTIGRAVITY 2</span>
                        <span
                            className={`px-1.5 py-0.2 rounded-full text-xs font-semibold tabular-nums ${
                                isAg2
                                    ? 'bg-white/20 text-white'
                                    : 'bg-white/10 text-[#9e9e9e] md:bg-black/[0.06] md:text-[#6e6e6e]'
                            }`}
                        >
                            {ag2Projects.reduce((acc, p) => acc + (p.totalCount || 0), 0)}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => handleSwitchProvider('win1')}
                        className={`justify-center px-3 py-1.5 md:py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                            isWin1
                                ? 'bg-[#0891b2] text-white border border-[#0891b2] md:bg-[#0e7490] md:border-[#0e7490] shadow-xs'
                                : 'text-[#9e9e9e] hover:text-white md:text-[#5f6368] md:hover:text-[#1f1f1f] hover:bg-white/5 md:hover:bg-black/[0.04]'
                        }`}
                    >
                        <img
                            src="/icons/dopamine-3d/sb_pc_monitor.png"
                            alt=""
                            className="w-4 h-4 shrink-0 object-contain"
                        />
                        <span>AG3 · {win1HostName}</span>
                        <span
                            className={`px-1.5 py-0.2 rounded-full text-xs font-semibold tabular-nums ${
                                isWin1
                                    ? 'bg-white/20 text-white'
                                    : 'bg-white/10 text-[#9e9e9e] md:bg-black/[0.06] md:text-[#6e6e6e]'
                            }`}
                        >
                            {win1Projects.reduce((acc, p) => acc + (p.totalCount || 0), 0)}
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

                    <span
                        className={`hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                            isWin1 && !win1Online ? 'bg-amber-50 text-amber-800' : 'bg-[#e6f4ea] text-[#137333]'
                        }`}
                    >
                        <span
                            className={`w-1.5 h-1.5 rounded-full ${
                                isWin1 && !win1Online ? 'bg-amber-500' : 'bg-[#137333]'
                            }`}
                        />
                        {isChatGPT
                            ? 'Đồng bộ ChatGPT PC (.codex)'
                            : isAg2
                            ? 'Đồng bộ Antigravity 2 (acct2)'
                            : isWin1
                            ? `Đồng bộ ${win1HostName} (${win1Online ? 'Online' : 'Offline'})`
                            : 'Đồng bộ Antigravity PC'}
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
                                    <Search className={`w-3.5 h-3.5 shrink-0 ${deepSearchLoading ? 'text-indigo-500 animate-pulse' : 'text-[#8e8e8e]'}`} />
                                    <input
                                        ref={sidebarSearchInputRef}
                                        type="text"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        placeholder={isChatGPT ? 'Tìm không dấu ChatGPT PC (nhấn /)...' : 'Tìm không dấu mọi hội thoại (nhấn /)...'}
                                        className="w-full bg-transparent text-xs text-[#1f1f1f] placeholder-[#8e8e8e] outline-none"
                                        autoFocus
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchQuery('')}
                                            aria-label="Xóa tìm kiếm"
                                            className="text-[#8e8e8e] hover:text-[#1f1f1f] cursor-pointer"
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
                                        onClick={openCustomizationsModal}
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
                            {renderDeepSearchResultsBlock(true)}

                            {/* Pinned Conversations (Đã ghim) */}
                            {(() => {
                                const filteredPinned = filterConvList(effectivePinnedConversations);
                                if (filteredPinned.length === 0) return null;
                                return (
                                    <div>
                                        <div className="px-1.5 mb-1 text-xs text-[#787878] font-normal">
                                            {isChatGPT ? 'Đã ghim' : 'Pinned Conversations'}
                                        </div>
                                        <div className="space-y-0.5">
                                            {filteredPinned.map(conv => {
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
                                                                <HighlightText text={maskEmailsInText(conv.title)} query={searchQuery} />
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
                                );
                            })()}

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
                                        const isCollapsed = searchActive ? false : !!collapsedProjects[proj.id];
                                        const isExpandedAll = searchActive || !!expandedSeeAllProjects[proj.id];
                                        const filteredConvs = filterConvList(proj.conversations);
                                        if ((searchActive || filterUnreadOnly) && filteredConvs.length === 0) {
                                            return null;
                                        }
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
                                                                            <HighlightText
                                                                                text={maskEmailsInText(
                                                                                    !isChatGPT &&
                                                                                        conv.provider !== 'chatgpt' &&
                                                                                        conv.workspaceTag
                                                                                        ? `Claude giao · ${conv.workspaceTag} · ${conv.title}`
                                                                                        : conv.title
                                                                                )}
                                                                                query={searchQuery}
                                                                            />
                                                                        </span>

                                                                        <div className="shrink-0 flex items-center justify-end gap-1 min-w-[24px]">
                                                                            {(conv.queuedCount || 0) > 0 && (
                                                                                <span
                                                                                    title={`${conv.queuedCount} prompt đang chờ`}
                                                                                    className="px-1.5 py-0.5 rounded-full text-xs font-medium tabular-nums bg-[#e8f0fe] text-[#174ea6]"
                                                                                >
                                                                                    +{conv.queuedCount} chờ
                                                                                </span>
                                                                            )}
                                                                            {conv.hasError ? (
                                                                                <AlertCircleRedIcon
                                                                                    className="w-[15px] h-[15px]"
                                                                                    title={conv.errorMessage || 'Bạn đã hết lượt sử dụng Codex và Công việc'}
                                                                                />
                                                                            ) : conv.turnState?.phase === 'retrying' ? (
                                                                                <span
                                                                                    title={conv.turnState.lastError || 'Đang thử lại phản hồi'}
                                                                                    className="px-1.5 py-0.5 rounded-full text-xs font-medium tabular-nums bg-[#fef7e0] text-[#9a6700]"
                                                                                >
                                                                                    Thử lại {conv.turnState.retryAttempt || 1}/{conv.turnState.maxRetries || 2}
                                                                                </span>
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

                                                        {proj.totalCount > defaultLimit && !searchActive && (
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
                                    {searchActive &&
                                        !deepSearchLoading &&
                                        deepSearchResults.length === 0 &&
                                        filterConvList(effectivePinnedConversations).length === 0 &&
                                        effectiveProjects.every(p => filterConvList(p.conversations).length === 0) && (
                                            <div className="py-6 px-2 text-center space-y-2 text-xs text-[#787878]">
                                                <div>Không tìm thấy hội thoại khớp &ldquo;{searchQuery}&rdquo;.</div>
                                                <div className="flex flex-wrap justify-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSearchQuery('')}
                                                        className="px-2.5 py-1 rounded-md bg-white border border-[#dfdfd8] text-[#1f1f1f] font-medium cursor-pointer"
                                                    >
                                                        Xóa từ khóa
                                                    </button>
                                                    {(
                                                        [
                                                            { id: 'antigravity', label: 'Antigravity' },
                                                            { id: 'antigravity2', label: 'Antigravity 2' },
                                                            { id: 'win1', label: win1HostName },
                                                            { id: 'chatgpt', label: 'ChatGPT PC' },
                                                        ] as const
                                                    )
                                                        .filter(p => p.id !== activeProvider)
                                                        .map(p => (
                                                            <button
                                                                key={`desk_sw_${p.id}`}
                                                                type="button"
                                                                onClick={() => handleSwitchProvider(p.id)}
                                                                className="px-2.5 py-1 rounded-md bg-[#eef4ff] text-[#1967d2] font-medium cursor-pointer"
                                                            >
                                                                Tìm bên {p.label}
                                                            </button>
                                                        ))}
                                                </div>
                                            </div>
                                        )}
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
                                            isWin1
                                                ? win1Online
                                                    ? 'bg-[#2e7d32]'
                                                    : 'bg-[#fbbc04]'
                                                : wsLiveConnected
                                                ? 'bg-[#2e7d32]'
                                                : 'bg-[#fbbc04]'
                                        }`}
                                    />
                                    <span className="text-[12.5px] font-medium text-[#1f1f1f] truncate">
                                        {isChatGPT ? 'ChatGPT PC (.codex)' : isAg2 ? ag2HostName : isWin1 ? win1HostName : hostName}
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
                                            className={`p-1 rounded-md shrink-0 transition-colors ${
                                                activeConversation.pinned
                                                    ? 'text-[#1967d2] bg-[#eef4ff]'
                                                    : 'text-[#787878] hover:text-[#1f1f1f] hover:bg-black/[0.04]'
                                            }`}
                                        >
                                            <Pin className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    {isSystemOwner && isChatGPT && activeConversation && (
                                        <button
                                            type="button"
                                            onClick={() => handleOpenChatGptPc(activeConversation.id)}
                                            disabled={openingChatGptPc}
                                            title="Mở phiên này trong ứng dụng ChatGPT PC"
                                            className="px-2 py-1 rounded-md text-xs font-medium text-[#1f1f1f] bg-white border border-[#e2e2e0] hover:bg-[#fcfcfb] disabled:opacity-60 flex items-center gap-1 shrink-0 transition-colors"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5 text-[#1967d2]" />
                                            <span>{openingChatGptPc ? 'Đang mở...' : 'Mở ChatGPT PC'}</span>
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

                        {/* Top-Right Icons: Search in Conversation + Feedback (!) + User Avatar ('vu') */}
                        <div className="flex items-center gap-2.5 ml-auto shrink-0">
                            {activeConversationId && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setInConvSearchOpen(v => !v);
                                        window.setTimeout(() => inConvSearchInputRef.current?.focus(), 40);
                                    }}
                                    title="Tìm tin nhắn trong hội thoại (Ctrl+F)"
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
                                        inConvSearchOpen || inConvSearchQuery.trim()
                                            ? 'bg-[#eef4ff] border-[#b7d0fb] text-[#1967d2]'
                                            : 'bg-white border-[#e2e2e0] text-[#5f6368] hover:text-[#1f1f1f]'
                                    }`}
                                >
                                    <Search className="w-3.5 h-3.5" />
                                    <span className="hidden lg:inline">Tìm</span>
                                </button>
                            )}
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

                            <div className="inline-flex items-center rounded-full bg-white border border-[#e2e2e0] shadow-2xs shrink-0 overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setSettingsModalOpen(true)}
                                    title={headerAccountTooltip}
                                    className="inline-flex items-center gap-2 pl-1 pr-2 py-0.5 hover:bg-[#f3f3f2] active:scale-[0.99] transition-all cursor-pointer"
                                >
                                    <span className="p-[2px] rounded-full bg-gradient-to-tr from-[#4285F4] via-[#34A853] to-[#FBBC05] shrink-0">
                                        <span
                                            className={`w-6 h-6 rounded-full ${
                                                resolvedHeaderAccount?.avatarBgClass || 'bg-[#004d40]'
                                            } text-white text-xs font-semibold flex items-center justify-center tracking-tight`}
                                        >
                                            {resolvedHeaderAccount ? resolvedHeaderAccount.initials : avatarInitials}
                                        </span>
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 min-w-0 max-w-[260px] lg:max-w-[340px] xl:max-w-[440px]">
                                        <span className="text-xs font-semibold text-[#1f1f1f] shrink-0">
                                            {resolvedHeaderAccount ? resolvedHeaderAccount.displayName : `@${member.username}`}
                                        </span>
                                        {resolvedHeaderAccount?.showSeparateEmail && (
                                            <span className="text-xs font-normal text-[#5f6368] truncate">
                                                · {resolvedHeaderAccount.formattedEmail}
                                            </span>
                                        )}
                                    </span>
                                    <span
                                        className={`px-1.5 py-0.5 rounded-md shrink-0 ${
                                            resolvedHeaderAccount?.badgeClass || 'bg-[#eef4ff] text-[#1967d2]'
                                        } text-xs font-semibold leading-none`}
                                    >
                                        {resolvedHeaderAccount ? resolvedHeaderAccount.tierBadge : roleDisplayLabel}
                                    </span>
                                </button>
                                {isSystemOwner && resolvedHeaderAccount?.email && (
                                    <button
                                        type="button"
                                        onClick={toggleAccountEmailMask}
                                        title={showAccountEmails ? 'Che email khi livestream' : 'Hiện đầy đủ email'}
                                        aria-label={showAccountEmails ? 'Che email khi livestream' : 'Hiện đầy đủ email'}
                                        className="pl-1 pr-2 py-1 text-[#5f6368] hover:text-[#1f1f1f] hover:bg-[#f3f3f2] border-l border-[#ececea] transition-colors cursor-pointer"
                                    >
                                        {showAccountEmails ? (
                                            <EyeOff className="w-3.5 h-3.5" />
                                        ) : (
                                            <Eye className="w-3.5 h-3.5" />
                                        )}
                                    </button>
                                )}
                            </div>
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
                                                        {isAg2
                                                            ? 'Select Antigravity 2 Project'
                                                            : isWin1
                                                            ? `Select ${win1HostName} Project`
                                                            : 'Select Workspace Project'}
                                                    </div>
                                                    {effectiveProjects.map(p => (
                                                        <button
                                                            key={p.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setEffectiveTargetProject(p.id, p.name);
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
                            {renderInConvSearchBar(true)}
                            <div ref={desktopScrollContainerRef} className="flex-1 overflow-y-auto px-6 py-4 select-text">
                                <div className="max-w-[740px] mx-auto space-y-5 pb-6">
                                    {isLoadingConversation && !activeConversation ? (
                                        <div className="py-20 flex flex-col items-center justify-center gap-2.5 text-[#787878]">
                                            <Loader2 className="w-6 h-6 animate-spin text-[#1967d2]" />
                                            <span className="text-[13.5px]">Loading conversation trajectory...</span>
                                        </div>
                                    ) : (
                                        <>
                                            {activeConversation?.messages && activeConversation.messages.length > 0 ? (
                                                renderedDesktopMessages
                                            ) : !(activeConversation?.queuedPrompts?.length || activeConversation?.turnState?.phase === 'retrying' || activeConversation?.hasError) ? (
                                                <div className="py-12 text-center text-[13.5px] text-[#787878]">
                                                    No steps recorded yet. Enter a message below to continue.
                                                </div>
                                            ) : null}
                                            {renderTurnStatusAndQueuedCards(true)}
                                        </>
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

                            <div className="relative min-w-0 flex-1 max-w-[146px] sm:max-w-[188px]">
                                <button
                                    type="button"
                                    onClick={() => setHostMenuOpen(prev => !prev)}
                                    className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-[10px] bg-[#252624] hover:bg-[#2c2d2a] border border-[#3a3b38] transition-colors min-w-0"
                                >
                                    <span className="flex items-center gap-2 min-w-0">
                                        <span
                                            className={`w-2 h-2 rounded-full shrink-0 ${
                                                isWin1
                                                    ? win1Online
                                                        ? 'bg-[#689f38]'
                                                        : 'bg-[#fbbc04]'
                                                    : wsLiveConnected
                                                    ? 'bg-[#689f38]'
                                                    : 'bg-[#fbbc04]'
                                            }`}
                                        />
                                        <span className="text-[13.5px] text-[#e3e3e3] truncate font-normal tracking-tight">
                                            {isChatGPT ? 'ChatGPT PC (.codex)' : isAg2 ? ag2HostName : isWin1 ? win1HostName : hostName}
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
                            {onOpenVirtualOffice && (
                                <button
                                    type="button"
                                    onClick={onOpenVirtualOffice}
                                    title="Chuyển nhanh sang 5. Văn phòng ảo 3D"
                                    className="px-2 py-1 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-bold inline-flex items-center gap-1 transition-colors shrink-0"
                                >
                                    <img
                                        src="/icons/dopamine-3d/menu_3_1_office3d.png"
                                        alt=""
                                        className="w-3.5 h-3.5 object-contain shrink-0"
                                    />
                                    <span>3D</span>
                                </button>
                            )}
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
                                title={
                                    isChatGPT
                                        ? 'Cài đặt ChatGPT PC'
                                        : isWin1
                                        ? `Cài đặt ${win1HostName}`
                                        : 'Cài đặt Antigravity'
                                }
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
                                title={headerAccountTooltip}
                            >
                                <div className={`w-7 h-7 rounded-full ${resolvedHeaderAccount?.avatarBgClass || 'bg-[#689f38]'} text-white text-xs font-semibold flex items-center justify-center tracking-tight`}>
                                    {resolvedHeaderAccount ? resolvedHeaderAccount.initials : (member.username || 'd').slice(0, 1).toLowerCase()}
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
                            <button
                                type="button"
                                onClick={() => {
                                    setInConvSearchOpen(v => !v);
                                    window.setTimeout(() => inConvSearchInputRef.current?.focus(), 40);
                                }}
                                title="Tìm tin nhắn trong hội thoại"
                                className={`p-1.5 rounded-full transition-colors ${
                                    inConvSearchOpen || inConvSearchQuery.trim()
                                        ? 'text-[#8ab4f8] bg-[#8ab4f8]/15'
                                        : 'text-[#9e9e9e] hover:text-white hover:bg-white/5'
                                }`}
                            >
                                <Search className="w-[18px] h-[18px]" />
                            </button>
                            {isSystemOwner && isChatGPT && activeConversation && (
                                <button
                                    type="button"
                                    onClick={() => handleOpenChatGptPc(activeConversation.id)}
                                    disabled={openingChatGptPc}
                                    title="Mở phiên này trong ứng dụng ChatGPT PC"
                                    aria-label="Mở ChatGPT PC"
                                    className="px-2 py-1 rounded-full text-xs font-medium text-[#8ab4f8] bg-[#8ab4f8]/15 hover:bg-[#8ab4f8]/25 disabled:opacity-60 flex items-center gap-1 shrink-0 transition-colors"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>PC</span>
                                </button>
                            )}
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
                                title={headerAccountTooltip}
                            >
                                <div className={`w-7 h-7 rounded-full ${resolvedHeaderAccount?.avatarBgClass || 'bg-[#689f38]'} text-white text-xs font-semibold flex items-center justify-center tracking-tight`}>
                                    {resolvedHeaderAccount ? resolvedHeaderAccount.initials : (member.username || 'd').slice(0, 1).toLowerCase()}
                                </div>
                            </button>
                        </div>
                    </header>
                )}

                {searchBarOpen && !activeConversationId && (
                    <div className="px-3.5 py-2 bg-[#1e1f1c] border-b border-[#2c2d2a] shrink-0">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#252624] border border-[#3a3b38]">
                            <Search className={`w-4 h-4 shrink-0 ${deepSearchLoading ? 'text-[#8ab4f8] animate-pulse' : 'text-[#8e8e8e]'}`} />
                            <input
                                ref={sidebarSearchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder={isChatGPT ? 'Tìm không dấu ChatGPT PC...' : 'Tìm không dấu mọi hội thoại...'}
                                className="w-full bg-transparent text-[16px] text-[#e3e3e3] placeholder-[#8e8e8e] outline-none"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    aria-label="Xóa tìm kiếm"
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
                        <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
                            <button
                                type="button"
                                onClick={openCustomizationsModal}
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
                                            activeProvider === 'antigravity' ? 'bg-[#363734] text-[#e3e3e3]' : 'text-[#8e8e8e]'
                                        }`}
                                    >
                                        <AntigravityRibbonLogo className="w-3 h-3" />
                                        <span>Antigravity</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSwitchProvider('antigravity2')}
                                        className={`px-2 py-0.5 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
                                            isAg2 ? 'bg-[#7c3aed] text-white' : 'text-[#8e8e8e]'
                                        }`}
                                    >
                                        <AntigravityRibbonLogo className="w-3 h-3" />
                                        <span>AG 2</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSwitchProvider('win1')}
                                        className={`px-2 py-0.5 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
                                            isWin1 ? 'bg-[#0891b2] text-white' : 'text-[#8e8e8e]'
                                        }`}
                                    >
                                        <img
                                            src="/icons/dopamine-3d/sb_pc_monitor.png"
                                            alt=""
                                            className="w-3 h-3 object-contain"
                                        />
                                        <span>WIN1</span>
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

                        {/* Active Login Identity Strip (Active PC AI Account + Portal Account) */}
                        <button
                            type="button"
                            onClick={() => setSettingsModalOpen(true)}
                            className="w-full px-3 py-2 rounded-xl bg-[#20211f] hover:bg-[#262724] border border-[#323330] flex items-center justify-between gap-2 text-left transition-colors"
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <span
                                    className={`w-6 h-6 rounded-full ${
                                        resolvedHeaderAccount?.avatarBgClass || 'bg-[#004d40]'
                                    } border border-[#57ab5a]/60 text-white text-xs font-semibold flex items-center justify-center shrink-0`}
                                >
                                    {resolvedHeaderAccount
                                        ? resolvedHeaderAccount.initials
                                        : (member.username || 'v').slice(0, 1).toLowerCase()}
                                </span>
                                <div className="min-w-0">
                                    <div className="text-xs font-medium text-[#e3e3e3] truncate">
                                        {resolvedHeaderAccount ? (
                                            <>
                                                {resolvedHeaderAccount.displayName}{' '}
                                                <span className="text-[#a5b4fc] font-semibold">
                                                    ({resolvedHeaderAccount.tierBadge})
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                @{member.username}{' '}
                                                <span className="text-[#8e8e8e] font-normal">
                                                    ({roleDisplayLabel})
                                                </span>
                                            </>
                                        )}
                                    </div>
                                    <div className="text-xs text-[#9e9e9e] truncate">
                                        {resolvedHeaderAccount ? (
                                            <>
                                                {resolvedHeaderAccount.email
                                                    ? `${formatLoginEmail(resolvedHeaderAccount.email)} · `
                                                    : ''}
                                                Portal: @{member.username} ({roleDisplayLabel})
                                            </>
                                        ) : isChatGPT ? (
                                            'ChatGPT PC · Bấm xem tài khoản'
                                        ) : isAg2 ? (
                                            'Antigravity 2 (acct2) · Bấm xem tài khoản'
                                        ) : isWin1 ? (
                                            `${win1HostName} (@win1) · Bấm xem tài khoản`
                                        ) : (
                                            'Antigravity · Bấm xem tài khoản'
                                        )}
                                    </div>
                                </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-[#8e8e8e] shrink-0" />
                        </button>

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

                        {renderDeepSearchResultsBlock(false)}

                        {(() => {
                            const filteredMobPinned = filterConvList(effectivePinnedConversations);
                            if (filteredMobPinned.length === 0) return null;
                            return (
                            <section>
                                <button
                                    type="button"
                                    onClick={() => setPinnedSectionOpen(prev => !prev)}
                                    className="flex items-center gap-1.5 text-[13.5px] text-[#9e9e9e] hover:text-[#e3e3e3] py-1.5 transition-colors"
                                >
                                    <span>{isChatGPT ? 'Đã ghim' : 'Pinned Conversations'}</span>
                                    <ChevronDown
                                        className={`w-3.5 h-3.5 transition-transform ${
                                            pinnedSectionOpen || searchActive ? '' : '-rotate-90'
                                        }`}
                                    />
                                </button>

                                {(pinnedSectionOpen || searchActive) && (
                                    <div className="mt-1 space-y-1">
                                        {filteredMobPinned.map(conv => (
                                            <div
                                                key={`mob_pin_${conv.id}`}
                                                onClick={() => handleOpenConversation(conv)}
                                                className="group py-2 px-1.5 -mx-1.5 rounded-lg hover:bg-white/[0.04] active:bg-white/[0.08] cursor-pointer transition-colors"
                                            >
                                                <div className="flex items-baseline justify-between gap-3">
                                                    <span className="text-[15.5px] text-[#e3e3e3] font-normal truncate">
                                                        <HighlightText
                                                            text={maskEmailsInText(conv.title)}
                                                            query={searchQuery}
                                                            markClassName="bg-amber-400/35 text-[#fff3cd] rounded px-0.5 font-semibold"
                                                        />
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
                            );
                        })()}

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
                                                Đang đồng bộ dự án từ{' '}
                                                {isChatGPT ? 'ChatGPT PC (.codex)' : isAg2 ? ag2HostName : isWin1 ? win1HostName : hostName}...
                                            </span>
                                        </div>
                                    ) : (
                                        effectiveProjects.map(proj => {
                                            const isCollapsed = searchActive ? false : !!collapsedProjects[proj.id];
                                            const isExpandedAll = searchActive || !!expandedSeeAllProjects[proj.id];
                                            const filteredConvs = filterConvList(proj.conversations);
                                            if ((searchActive || filterUnreadOnly) && filteredConvs.length === 0) {
                                                return null;
                                            }
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
                                                                            <HighlightText
                                                                                text={maskEmailsInText(
                                                                                    !isChatGPT &&
                                                                                        conv.provider !== 'chatgpt' &&
                                                                                        conv.workspaceTag
                                                                                        ? `Claude giao · ${conv.workspaceTag} · ${conv.title}`
                                                                                        : conv.title
                                                                                )}
                                                                                query={searchQuery}
                                                                                markClassName="bg-amber-400/35 text-[#fff3cd] rounded px-0.5 font-semibold"
                                                                            />
                                                                        </span>

                                                                        <div className="shrink-0 flex items-center justify-end gap-1.5 min-w-[28px]">
                                                                            {(conv.queuedCount || 0) > 0 && (
                                                                                <span
                                                                                    title={`${conv.queuedCount} prompt đang chờ`}
                                                                                    className="px-1.5 py-0.5 rounded-full text-xs font-medium tabular-nums bg-[#1f324d] text-[#a8c7fa]"
                                                                                >
                                                                                    +{conv.queuedCount}
                                                                                </span>
                                                                            )}
                                                                            {conv.hasError ? (
                                                                                <AlertCircleRedIcon
                                                                                    className="w-4 h-4"
                                                                                    title={conv.errorMessage || 'Lỗi hạn mức lượt chạy'}
                                                                                />
                                                                            ) : conv.turnState?.phase === 'retrying' ? (
                                                                                <span
                                                                                    title={conv.turnState.lastError || 'Đang thử lại phản hồi'}
                                                                                    className="px-1.5 py-0.5 rounded-full text-xs font-medium tabular-nums bg-[#3a2d12] text-[#fde293]"
                                                                                >
                                                                                    Thử lại {conv.turnState.retryAttempt || 1}/{conv.turnState.maxRetries || 2}
                                                                                </span>
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

                                                            {proj.totalCount > defaultLimit && !searchActive && (
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
                                    {searchActive &&
                                        !deepSearchLoading &&
                                        deepSearchResults.length === 0 &&
                                        filterConvList(effectivePinnedConversations).length === 0 &&
                                        effectiveProjects.every(p => filterConvList(p.conversations).length === 0) && (
                                            <div className="py-8 px-2 text-center space-y-2.5 text-xs text-[#9e9e9e]">
                                                <div>Không tìm thấy hội thoại khớp &ldquo;{searchQuery}&rdquo;.</div>
                                                <div className="flex flex-wrap justify-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSearchQuery('')}
                                                        className="px-3 py-1.5 rounded-lg bg-[#2a2b28] border border-[#3e3f3c] text-[#e3e3e3] font-medium cursor-pointer"
                                                    >
                                                        Xóa từ khóa
                                                    </button>
                                                    {(
                                                        [
                                                            { id: 'antigravity', label: 'Antigravity' },
                                                            { id: 'antigravity2', label: 'Antigravity 2' },
                                                            { id: 'win1', label: win1HostName },
                                                            { id: 'chatgpt', label: 'ChatGPT PC' },
                                                        ] as const
                                                    )
                                                        .filter(p => p.id !== activeProvider)
                                                        .map(p => (
                                                            <button
                                                                key={`mob_sw_${p.id}`}
                                                                type="button"
                                                                onClick={() => handleSwitchProvider(p.id)}
                                                                className="px-3 py-1.5 rounded-lg bg-[#8ab4f8]/15 border border-[#8ab4f8]/40 text-[#8ab4f8] font-medium cursor-pointer"
                                                            >
                                                                Tìm bên {p.label}
                                                            </button>
                                                        ))}
                                                </div>
                                            </div>
                                        )}
                                </div>
                            )}
                        </section>
                    </div>
                ) : (
                    /* MOBILE ACTIVE CONVERSATION VIEW (Exact match to antigravity.google.com) */
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative bg-[#1e1f1c]">
                        {renderInConvSearchBar(false)}
                        <div
                            ref={mobileScrollContainerRef}
                            onScroll={e => {
                                const el = e.currentTarget;
                                const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
                                setShowMobileScrollDownBtn(dist > 60);
                            }}
                            className="flex-1 min-h-0 overflow-y-auto px-3.5 pt-3 pb-4 space-y-3.5 select-text [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                        >
                            {isLoadingConversation && !activeConversation ? (
                                <div className="py-16 flex flex-col items-center justify-center gap-2.5 text-[#8e8e8e]">
                                    <Loader2 className="w-6 h-6 animate-spin text-[#8ab4f8]" />
                                    <span className="text-[13.5px]">Đang tải nội dung phiên làm việc...</span>
                                </div>
                            ) : (
                                <>
                                    {activeConversation?.messages && activeConversation.messages.length > 0 ? (
                                        renderedMobileMessages
                                    ) : !(activeConversation?.queuedPrompts?.length || activeConversation?.turnState?.phase === 'retrying' || activeConversation?.hasError) ? (
                                        <div className="py-12 text-center text-[14px] text-[#8e8e8e]">
                                            Chưa có bước hiển thị trong phiên này. Hãy gửi yêu cầu bên dưới để tiếp tục.
                                        </div>
                                    ) : null}
                                    {renderTurnStatusAndQueuedCards(false)}
                                </>
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
                                                setEffectiveTargetProject(p.id, p.name);
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
                                                    setEffectiveSelectedModel(m);
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
                                                    {!isChatGPT && m.remainingFraction !== undefined && (
                                                        <span
                                                            className={`text-[12.5px] tabular-nums ${
                                                                Math.round((m.remainingFraction ?? 0.99) * 100) <= 0
                                                                    ? 'text-[#f28b82] font-semibold'
                                                                    : Math.round((m.remainingFraction ?? 0.99) * 100) <= 15
                                                                    ? 'text-[#fdd663] font-medium'
                                                                    : 'text-[#8e8e8e]'
                                                            }`}
                                                        >
                                                            {Math.round((m.remainingFraction ?? 0.99) * 100) <= 0
                                                                ? 'Hết quota (0%)'
                                                                : `${Math.round((m.remainingFraction ?? 0.99) * 100)}%`}
                                                        </span>
                                                    )}
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

                                {(isSubmitting ||
                                    isCancelling ||
                                    activeConversation?.isRunning ||
                                    activeConversation?.turnState?.phase === 'retrying' ||
                                    activeConversation?.turnState?.phase === 'cancelling') && (
                                    <button
                                        type="button"
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={handleCancelRunning}
                                        disabled={isCancelling}
                                        title="Dừng tác vụ đang chạy"
                                        data-testid="mobile-stop-btn"
                                        className="w-9 h-9 rounded-full bg-[#333432] hover:bg-[#3e3f3c] flex items-center justify-center transition-all active:scale-95 shrink-0 disabled:opacity-60"
                                    >
                                        <span className="w-3.5 h-3.5 rounded-[3px] bg-[#ea4335] block" />
                                    </button>
                                )}

                                {(promptText.trim() ||
                                    attachedMedia.length > 0 ||
                                    !(
                                        isSubmitting ||
                                        isCancelling ||
                                        activeConversation?.isRunning ||
                                        activeConversation?.turnState?.phase === 'retrying' ||
                                        activeConversation?.turnState?.phase === 'cancelling'
                                    )) && (
                                    <button
                                        type="button"
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={handleSubmitPrompt}
                                        disabled={isSubmitting || (!promptText.trim() && attachedMedia.length === 0)}
                                        title={
                                            activeConversation?.isRunning ||
                                            activeConversation?.turnState?.phase === 'retrying'
                                                ? 'Đưa vào hàng chờ'
                                                : 'Gửi yêu cầu'
                                        }
                                        data-testid="mobile-submit-btn"
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
                        className="w-full max-w-xl rounded-2xl bg-white text-[#1f1f1f] border border-[#dfdfd8] p-4 space-y-3 shadow-2xl"
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

                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#f7f7f5] border border-[#dfdfd8]">
                            <Search className={`w-4 h-4 shrink-0 ${deepSearchLoading ? 'text-indigo-500 animate-pulse' : 'text-[#8e8e8e]'}`} />
                            <input
                                type="text"
                                value={historySearchQuery}
                                onChange={e => setHistorySearchQuery(e.target.value)}
                                placeholder="Tìm không dấu toàn bộ lịch sử tiêu đề & nội dung..."
                                className="w-full bg-transparent text-xs text-[#1f1f1f] placeholder-[#8e8e8e] outline-none"
                                autoFocus
                            />
                            {historySearchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setHistorySearchQuery('')}
                                    aria-label="Xóa tìm lịch sử"
                                    className="text-[#787878] hover:text-[#1f1f1f] cursor-pointer"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {(() => {
                            const hTokens = tokenizeVnSearch(historySearchQuery);
                            const localAll = effectiveProjects.flatMap(p => p.conversations);
                            let listToShow: CompanionConversationItem[] = [];
                            if (hTokens.length === 0) {
                                listToShow = localAll;
                            } else {
                                const byId = new Map<string, CompanionConversationItem>();
                                deepSearchResults.forEach(c => byId.set(c.id, c));
                                localAll.forEach(c => {
                                    if (!byId.has(c.id) && matchesAllVnTokens(`${c.title} ${c.projectName} ${c.workspaceTag || ''}`, hTokens)) {
                                        byId.set(c.id, c);
                                    }
                                });
                                listToShow = Array.from(byId.values()).sort(
                                    (a, b) => Number(b.matchScore || 0) - Number(a.matchScore || 0) || (b.lastModifiedEpoch || 0) - (a.lastModifiedEpoch || 0)
                                );
                            }
                            return (
                                <>
                                    <div className="text-xs text-[#787878] flex items-center justify-between tabular-nums">
                                        <span>
                                            {hTokens.length > 0
                                                ? `${listToShow.length} hội thoại khớp (cả lịch sử sâu)`
                                                : `${listToShow.length} hội thoại gần nhất`}
                                        </span>
                                        {deepSearchLoading && hTokens.length >= 1 && (
                                            <span className="text-indigo-600 font-medium">Đang tìm toàn PC...</span>
                                        )}
                                    </div>
                                    <div className="max-h-96 overflow-y-auto space-y-1 pr-1">
                                        {listToShow.length === 0 ? (
                                            <div className="py-10 text-center text-xs text-[#787878] space-y-2">
                                                <div>Không tìm thấy hội thoại nào khớp &ldquo;{historySearchQuery}&rdquo;.</div>
                                                {historySearchQuery && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setHistorySearchQuery('')}
                                                        className="px-3 py-1 rounded-lg bg-[#f3f3f1] border border-[#dfdfd8] text-[#1f1f1f] font-medium cursor-pointer"
                                                    >
                                                        Xóa bộ lọc
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            listToShow.map(conv => (
                                                <button
                                                    key={`hist_${conv.id}`}
                                                    type="button"
                                                    onClick={() => handleOpenConversation(conv)}
                                                    className="w-full px-3 py-2 rounded-lg hover:bg-black/[0.04] flex items-start justify-between text-left gap-3 cursor-pointer"
                                                >
                                                    <div className="min-w-0 space-y-0.5">
                                                        <div className="text-[13.5px] font-medium text-[#1f1f1f] truncate">
                                                            <HighlightText text={maskEmailsInText(conv.title)} query={historySearchQuery} />
                                                        </div>
                                                        {conv.snippet && hTokens.length > 0 && (
                                                            <div className="text-xs text-[#5f6368] line-clamp-2 break-words">
                                                                <HighlightText text={maskEmailsInText(conv.snippet)} query={historySearchQuery} />
                                                            </div>
                                                        )}
                                                        <div className="text-xs text-[#787878] flex items-center gap-1.5">
                                                            <Folder className="w-3 h-3 shrink-0" />
                                                            <span className="truncate">{conv.projectName}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0 pt-0.5">
                                                        {conv.hasError && (
                                                            <AlertCircleRedIcon className="w-3.5 h-3.5" />
                                                        )}
                                                        {conv.isRunning && (
                                                            <PcRunningArcSpinner className="w-3.5 h-3.5 text-[#1967d2]" />
                                                        )}
                                                        <span className="text-xs text-[#787878] tabular-nums">{conv.relativeTime}</span>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </>
                            );
                        })()}
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
                                <h3 className="text-[14.5px] font-medium">
                                    Customizations ({isAg2 ? ag2HostName : isWin1 ? win1HostName : hostName})
                                </h3>
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
                                        setEffectiveTargetProject(p.id, p.name);
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
                        className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-2xl bg-[#242424] text-white border border-[#383838] p-4 space-y-3.5 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {isChatGPT ? (
                                    <ChatGPTLogo className="w-5 h-5 text-white" />
                                ) : isWin1 ? (
                                    <img
                                        src="/icons/dopamine-3d/sb_pc_monitor.png"
                                        alt=""
                                        className="w-5 h-5 object-contain"
                                    />
                                ) : (
                                    <AntigravityRibbonLogo className="w-5 h-5" />
                                )}
                                <h3 className="text-[15px] font-medium text-white">
                                    {isChatGPT
                                        ? 'ChatGPT PC Settings'
                                        : isAg2
                                        ? 'Antigravity 2 (acct2) Settings'
                                        : isWin1
                                        ? `${win1HostName} (@win1) Settings`
                                        : 'Antigravity Settings'}
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSettingsModalOpen(false)}
                                className="text-[#8e8e8e] hover:text-white p-1 rounded-lg hover:bg-white/5"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-2.5 text-[13.5px]">
                            {/* 1. Tài khoản Web Portal aihot.vn đang đăng nhập */}
                            <div className="p-3 rounded-xl bg-[#1c1c1c] border border-[#363636] space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-[#8e8e8e] text-xs font-medium">
                                        Tài khoản đang đăng nhập (aihot.vn)
                                    </div>
                                    <span className="px-2 py-0.5 rounded-md bg-[#2a3b2e] text-[#81c995] text-xs font-semibold">
                                        {roleDisplayLabel}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2.5">
                                    <div className="w-9 h-9 rounded-full bg-[#004d40] border border-[#57ab5a]/60 text-white text-sm font-semibold flex items-center justify-center shrink-0">
                                        {avatarInitials}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-white font-medium truncate">
                                            {member.display_name || member.username}
                                        </div>
                                        <div className="text-xs text-[#8ab4f8] font-medium truncate">
                                            Tên đăng nhập: @{member.username}
                                        </div>
                                        {member.contact && (
                                            <div className="text-xs text-[#9e9e9e] truncate">
                                                Liên hệ: {formatLoginEmail(member.contact)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {(onOpenProfile || onLogout) && (
                                    <div className="flex items-center gap-2 pt-1">
                                        {onOpenProfile && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSettingsModalOpen(false);
                                                    onOpenProfile();
                                                }}
                                                className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#2b2c29] hover:bg-[#353632] border border-[#3e3f3b] text-[#e3e3e3] text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                                            >
                                                <User className="w-3.5 h-3.5" />
                                                <span>Hồ sơ tài khoản</span>
                                            </button>
                                        )}
                                        {onLogout && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSettingsModalOpen(false);
                                                    onLogout();
                                                }}
                                                className="flex-1 py-1.5 px-2.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                                            >
                                                <LogOut className="w-3.5 h-3.5" />
                                                <span>Đăng xuất / Đổi TK</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 2. Tài khoản AI đang active trên PC / Kho */}
                            <div className="p-3 rounded-xl bg-[#1c1c1c] border border-[#363636] space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-[#8e8e8e] text-xs font-medium">
                                        Tài khoản AI đang login ({isSystemOwner ? 'Trên PC' : 'Đang chọn'})
                                    </div>
                                    {isSystemOwner && (
                                        <button
                                            type="button"
                                            onClick={toggleAccountEmailMask}
                                            className="px-2 py-0.5 rounded-md bg-[#2b2c29] hover:bg-[#353632] text-[#b8b8b8] text-xs inline-flex items-center gap-1 transition-colors"
                                            title={showAccountEmails ? 'Che email khi livestream' : 'Hiện đầy đủ email'}
                                        >
                                            {showAccountEmails ? (
                                                <EyeOff className="w-3.5 h-3.5" />
                                            ) : (
                                                <Eye className="w-3.5 h-3.5" />
                                            )}
                                            <span>{showAccountEmails ? 'Che email' : 'Hiện email'}</span>
                                        </button>
                                    )}
                                </div>

                                <div
                                    className={`p-2.5 rounded-lg border space-y-0.5 ${
                                        activeProvider === 'antigravity'
                                            ? 'bg-[#242825] border-[#57ab5a]/45'
                                            : 'bg-[#171717] border-[#2c2c2c]'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-medium text-[#b8b8b8] inline-flex items-center gap-1.5">
                                            <AntigravityRibbonLogo className="w-3.5 h-3.5" />
                                            <span>AG1 · Antigravity (Bản chính)</span>
                                        </span>
                                        {resolvedActiveAgAccount?.tier && (
                                            <span className="px-1.5 py-0.5 rounded bg-[#363734] text-[#81c995] text-xs font-semibold">
                                                {resolvedActiveAgAccount.tier}
                                            </span>
                                        )}
                                    </div>
                                    {resolvedActiveAgAccount ? (
                                        <>
                                            <div className="text-white text-xs font-medium truncate">
                                                {resolvedActiveAgAccount.name ||
                                                    formatLoginEmail(resolvedActiveAgAccount.email) ||
                                                    'Đang hoạt động'}
                                            </div>
                                            {resolvedActiveAgAccount.email && (
                                                <div className="text-xs text-[#8ab4f8] truncate">
                                                    {formatLoginEmail(resolvedActiveAgAccount.email)}
                                                </div>
                                            )}
                                            <div className="text-xs text-[#787878]">
                                                Nguồn: {resolvedActiveAgAccount.source}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-xs text-[#787878]">
                                            Chưa ghi nhận tài khoản đang chọn
                                        </div>
                                    )}
                                </div>

                                {(isSystemOwner || isAg2) && (
                                    <div
                                        className={`p-2.5 rounded-lg border space-y-0.5 ${
                                            isAg2
                                                ? 'bg-[#251f38] border-[#7c3aed]/60'
                                                : 'bg-[#171717] border-[#2c2c2c]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs font-medium text-[#b8b8b8] inline-flex items-center gap-1.5">
                                                <AntigravityRibbonLogo className="w-3.5 h-3.5" />
                                                <span>AG2 · Antigravity 2 (acct2)</span>
                                            </span>
                                            {resolvedActiveAg2Account?.tier && (
                                                <span className="px-1.5 py-0.5 rounded bg-[#7c3aed]/25 text-[#d8b4fe] text-xs font-semibold">
                                                    {resolvedActiveAg2Account.tier}
                                                </span>
                                            )}
                                        </div>
                                        {resolvedActiveAg2Account ? (
                                            <>
                                                <div className="text-white text-xs font-medium truncate">
                                                    {resolvedActiveAg2Account.name ||
                                                        formatLoginEmail(resolvedActiveAg2Account.email) ||
                                                        'Đang hoạt động'}
                                                </div>
                                                {resolvedActiveAg2Account.email && (
                                                    <div className="text-xs text-[#c4b5fd] truncate">
                                                        {formatLoginEmail(resolvedActiveAg2Account.email)}
                                                    </div>
                                                )}
                                                <div className="text-xs text-[#787878]">
                                                    Nguồn: {resolvedActiveAg2Account.source} ·{' '}
                                                    {resolvedActiveAg2Account.online ? 'Đang chạy' : 'Tự mở khi giao việc'}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-xs text-[#787878]">
                                                Chưa ghi nhận tài khoản Antigravity 2
                                            </div>
                                        )}
                                    </div>
                                )}

                                {(isSystemOwner || isWin1) && (
                                    <div
                                        className={`p-2.5 rounded-lg border space-y-0.5 ${
                                            isWin1
                                                ? 'bg-[#16272e] border-[#0891b2]/60'
                                                : 'bg-[#171717] border-[#2c2c2c]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs font-medium text-[#b8b8b8] inline-flex items-center gap-1.5">
                                                <img
                                                    src="/icons/dopamine-3d/sb_pc_monitor.png"
                                                    alt=""
                                                    className="w-3.5 h-3.5 object-contain"
                                                />
                                                <span>AG3 · {win1HostName} (@win1)</span>
                                            </span>
                                            {resolvedActiveWin1Account?.tier && (
                                                <span className="px-1.5 py-0.5 rounded bg-[#0891b2]/25 text-[#67e8f9] text-xs font-semibold">
                                                    {resolvedActiveWin1Account.tier}
                                                </span>
                                            )}
                                        </div>
                                        {resolvedActiveWin1Account ? (
                                            <>
                                                <div className="text-white text-xs font-medium truncate">
                                                    {resolvedActiveWin1Account.name ||
                                                        formatLoginEmail(resolvedActiveWin1Account.email) ||
                                                        win1HostName}
                                                </div>
                                                {resolvedActiveWin1Account.email && (
                                                    <div className="text-xs text-[#67e8f9] truncate">
                                                        {formatLoginEmail(resolvedActiveWin1Account.email)}
                                                    </div>
                                                )}
                                                <div className="text-xs text-[#787878]">
                                                    Nguồn: {resolvedActiveWin1Account.source} ·{' '}
                                                    {win1Online ? 'Đang chạy · SSH Tunnel :18061' : 'Offline / Chờ kết nối'}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-xs text-[#787878]">
                                                {win1Online
                                                    ? `${win1HostName} đang chạy (chưa có email tài khoản)`
                                                    : `Chưa kết nối tới ${win1HostName}`}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {(isSystemOwner || isChatGPT) && (
                                    <div
                                        className={`p-2.5 rounded-lg border space-y-0.5 ${
                                            isChatGPT
                                                ? 'bg-[#1a2c26] border-[#10a37f]/50'
                                                : 'bg-[#171717] border-[#2c2c2c]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs font-medium text-[#b8b8b8] inline-flex items-center gap-1.5">
                                                <ChatGPTLogo className="w-3.5 h-3.5" />
                                                <span>ChatGPT PC (.codex)</span>
                                            </span>
                                            {resolvedActiveChatgptAccount?.planType && (
                                                <span className="px-1.5 py-0.5 rounded bg-[#10a37f]/20 text-[#6ee7b7] text-xs font-semibold">
                                                    {resolvedActiveChatgptAccount.planType}
                                                </span>
                                            )}
                                        </div>
                                        {resolvedActiveChatgptAccount ? (
                                            <>
                                                {resolvedActiveChatgptAccount.email ? (
                                                    <div className="text-white text-xs font-medium truncate">
                                                        {formatLoginEmail(resolvedActiveChatgptAccount.email)}
                                                    </div>
                                                ) : (
                                                    <div className="text-white text-xs font-medium truncate">
                                                        {resolvedActiveChatgptAccount.name || 'ChatGPT PC'}
                                                    </div>
                                                )}
                                                {resolvedActiveChatgptAccount.name &&
                                                    resolvedActiveChatgptAccount.email && (
                                                        <div className="text-xs text-[#9e9e9e] truncate">
                                                            {resolvedActiveChatgptAccount.name}
                                                        </div>
                                                    )}
                                                <div className="text-xs text-[#787878]">
                                                    Nguồn: {resolvedActiveChatgptAccount.source}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-xs text-[#787878]">
                                                Chưa phát hiện phiên ChatGPT PC
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 3. Connected Machine */}
                            <div className="p-3 rounded-xl bg-[#1c1c1c] border border-[#303030] space-y-1">
                                <div className="text-[#8e8e8e] text-xs">Connected Machine</div>
                                <div className="flex items-center gap-2 text-white font-medium text-xs">
                                    <span
                                        className={`w-2 h-2 rounded-full ${
                                            isWin1 && !win1Online ? 'bg-amber-400' : 'bg-[#57ab5a]'
                                        }`}
                                    />
                                    {isChatGPT
                                        ? 'ChatGPT PC (.codex Realtime Sync)'
                                        : isAg2
                                        ? `${ag2HostName} (${ag2Online ? 'Đang chạy · WebSocket Realtime Active' : 'Tự mở acct2 khi giao việc'})`
                                        : isWin1
                                        ? `${win1HostName} (${win1Online ? 'Đang chạy · SSH Tunnel :18061 -> :8047' : 'Offline · Kiểm tra WIN1-17TRIEU'})`
                                        : `${hostName} (WebSocket Realtime Active)`}
                                </div>
                            </div>

                            {/* 4. Execution Mode */}
                            <div className="p-3 rounded-xl bg-[#1c1c1c] border border-[#303030] space-y-1">
                                <div className="text-[#8e8e8e] text-xs">Execution Mode</div>
                                <div className="text-[#81c995] font-medium text-xs">
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
