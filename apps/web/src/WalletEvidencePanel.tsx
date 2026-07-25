import {
  CheckCircle2,
  History,
  LoaderCircle,
  Network,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppKit, useAppKitAccount, useDisconnect } from '@reown/appkit/react';
import { useSignMessage } from 'wagmi';

import { type WalletEvidence, NookApiError, nookApi } from './api.js';
import { reownConfigured } from './reown.js';

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function yearLabel(years: number[]): string {
  if (years.length === 0) return 'No dated activity';
  if (years.length === 1) return String(years[0]);
  return `${years[0]}–${years.at(-1)}`;
}

export function WalletEvidencePanel({
  evidence,
  onClear,
  onEvidence,
}: {
  evidence: WalletEvidence | null;
  onClear: () => void;
  onEvidence: (evidence: WalletEvidence) => void;
}) {
  if (!reownConfigured) {
    return null;
  }

  return (
    <ConnectedWalletEvidencePanel evidence={evidence} onClear={onClear} onEvidence={onEvidence} />
  );
}

function ConnectedWalletEvidencePanel({
  evidence,
  onClear,
  onEvidence,
}: {
  evidence: WalletEvidence | null;
  onClear: () => void;
  onEvidence: (evidence: WalletEvidence) => void;
}) {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount({ namespace: 'eip155' });
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (
      evidence &&
      (!address || evidence.walletControl.address.toLowerCase() !== address.toLowerCase())
    ) {
      onClear();
    }
  }, [address, evidence, onClear]);

  const verifyWallet = async () => {
    if (!address) return;

    setBusy(true);
    setLocalError(null);

    try {
      const challenge = await nookApi.createWalletChallenge(address);
      const signature = await signMessageAsync({ message: challenge.message });
      const result = await nookApi.readWalletEvidence({ challenge, signature });
      onEvidence(result);
    } catch (error) {
      if (error instanceof NookApiError) {
        setLocalError(error.message);
      } else if (error instanceof Error && /reject|denied|cancel/i.test(error.message)) {
        setLocalError('Signature cancelled. No wallet data was read.');
      } else {
        setLocalError('Wallet verification could not be completed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="wallet-evidence-card" aria-label="Optional wallet activity">
      <div className="wallet-evidence-heading">
        <span className="wallet-evidence-icon" aria-hidden="true">
          <WalletCards size={21} />
        </span>
        <div>
          <span className="optional-label">Optional onchain context</span>
          <h3>Bring your community history</h3>
        </div>
      </div>

      <p>
        Connect a wallet and sign a read-only message to show public ENS names and POAP
        participation. It never changes your Rental Reputation.
      </p>

      {!isConnected || !address ? (
        <button
          className="secondary-button full-width"
          type="button"
          onClick={() => void open({ view: 'Connect', namespace: 'eip155' })}
        >
          Connect wallet <WalletCards size={17} />
        </button>
      ) : evidence ? (
        <>
          <div className="wallet-verified-line">
            <span>
              <CheckCircle2 size={16} />
              {shortAddress(evidence.walletControl.address)}
            </span>
            <button type="button" onClick={() => void open({ view: 'Account' })}>
              Manage
            </button>
          </div>

          <div className="wallet-signal-grid">
            <div>
              <Sparkles size={18} />
              <strong>{evidence.signals.totalPoaps}</strong>
              <span>POAPs</span>
            </div>
            <div>
              <History size={18} />
              <strong>{evidence.signals.distinctEvents}</strong>
              <span>events</span>
            </div>
            <div>
              <ShieldCheck size={18} />
              <strong>{yearLabel(evidence.signals.activeYears)}</strong>
              <span>active years</span>
            </div>
          </div>

          {evidence.theGraph && (
            <div className="graph-wallet-signal">
              <Network size={18} />
              <div>
                <strong>{evidence.theGraph.ownedNames[0] ?? 'No ENS name found'}</strong>
                <span>
                  {evidence.theGraph.ownedNames.length > 0
                    ? `${evidence.theGraph.ownedNames.length}${evidence.theGraph.truncated ? '+' : ''} indexed name${evidence.theGraph.ownedNames.length === 1 ? '' : 's'}`
                    : 'Wallet checked on Ethereum'}
                </span>
              </div>
              <small>The Graph · ENS mainnet</small>
            </div>
          )}

          {evidence.recentPoaps.length > 0 && (
            <div className="recent-poaps">
              {evidence.recentPoaps.map((poap) => (
                <div className="recent-poap" key={poap.tokenId}>
                  {poap.imageUrl ? (
                    <img alt="" src={poap.imageUrl} />
                  ) : (
                    <span className="poap-placeholder" aria-hidden="true">
                      <Sparkles size={16} />
                    </span>
                  )}
                  <span>{poap.eventName ?? `POAP event ${poap.eventId}`}</span>
                </div>
              ))}
            </div>
          )}

          <small className="wallet-source">
            {evidence.theGraph
              ? 'Live sources · The Graph ENS · POAP Compass'
              : 'Live source · POAP Compass'}
          </small>
        </>
      ) : (
        <>
          <div className="wallet-connected-line">
            <span>{shortAddress(address)}</span>
            <button
              type="button"
              onClick={() => {
                void disconnect({ namespace: 'eip155' });
              }}
            >
              Disconnect
            </button>
          </div>
          <button
            className="secondary-button full-width"
            disabled={busy}
            type="button"
            onClick={() => void verifyWallet()}
          >
            {busy ? (
              <>
                <LoaderCircle className="spin" size={17} /> Reading wallet signals
              </>
            ) : (
              <>
                Verify wallet &amp; read signals <ShieldCheck size={17} />
              </>
            )}
          </button>
        </>
      )}

      {localError && <p className="wallet-local-error">{localError}</p>}
      <small className="wallet-privacy-note">
        Your signature authorizes this one public read only. Nook does not store the wallet
        collection in this demo.
      </small>
    </section>
  );
}
