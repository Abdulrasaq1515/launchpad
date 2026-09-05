import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AllowanceManager } from "@/components/AllowanceManager";
import { AllowancesPanel } from "@/components/ui/AllowancesPanel";

// Mock the hooks
jest.mock("@/app/hooks/useWallet");
jest.mock("@/app/providers/NetworkProvider", () => ({
  useNetwork: () => ({
    networkConfig: { horizonUrl: "https://horizon-testnet.stellar.org", network: "testnet" }
  }),
}));

// Mock stellar functions used by AllowanceManager
jest.mock("@/lib/stellar", () => ({
  buildApproveTransaction: jest.fn().mockResolvedValue("xdr-string"),
  fetchApprovedSpendersFromEvents: jest.fn().mockResolvedValue([]),
  fetchCurrentLedger: jest.fn().mockResolvedValue(1000000),
  fetchTokenDecimals: jest.fn().mockResolvedValue(7),
  fetchAllowanceWithExpiration: jest.fn().mockResolvedValue({ amount: BigInt(0), expirationLedger: 0 }),
  formatTokenAmount: jest.fn().mockReturnValue("0.0000000"),
  submitTransaction: jest.fn().mockResolvedValue("tx-hash"),
  truncateAddress: (addr: string) => addr.slice(0, 6) + "..." + addr.slice(-4),
}));

// Mock the forms
jest.mock("@/components/forms/ApproveForm", () => ({
  ApproveForm: ({ onSuccess }: { onSuccess: (txHash: string) => void }) => (
    <button onClick={() => onSuccess("tx-hash-1")}>Grant (Mocked)</button>
  ),
}));

jest.mock("@/components/forms/RevokeAllowanceForm", () => ({
  RevokeAllowanceForm: ({ onSuccess }: { onSuccess: (txHash: string) => void }) => (
    <button onClick={() => onSuccess("tx-hash-2")}>Revoke (Mocked)</button>
  ),
}));

jest.mock("@/components/forms/TransferFromForm", () => ({
  TransferFromForm: ({ onSuccess }: { onSuccess: (txHash: string) => void }) => (
    <button onClick={() => onSuccess("tx-hash-3")}>Transfer (Mocked)</button>
  ),
}));

import { useWallet } from "@/app/hooks/useWallet";

beforeEach(() => {
  (useWallet as jest.Mock).mockReturnValue({
    connected: true,
    publicKey: "GCPFGJGZOXPF5EZBQ7TGVGVW4ZBDAJT3RDSAICABJ7GCM3QQHLJNZ7PZ",
    signTransaction: jest.fn().mockResolvedValue("signed-xdr"),
    connect: jest.fn(),
  });
});

describe("AllowanceManager", () => {
  it("renders the manager with all tabs", () => {
    render(<AllowanceManager />);

    expect(screen.getByText("Token Allowances")).toBeInTheDocument();
    expect(screen.getByText("View Allowances")).toBeInTheDocument();
    expect(screen.getByText("Grant Allowance")).toBeInTheDocument();
    expect(screen.getByText("Revoke Allowance")).toBeInTheDocument();
    expect(screen.getByText("Transfer From")).toBeInTheDocument();
  });

  it("switches between tabs correctly", async () => {
    render(<AllowanceManager />);

    const revokeTab = screen.getByText("Revoke Allowance");
    await userEvent.click(revokeTab);

    // Check that content changed
    expect(screen.getByText("Revoke (Mocked)")).toBeInTheDocument();
  });

  it("displays success notification after grant", async () => {
    render(<AllowanceManager />);

    const grantButton = screen.getByText("Grant (Mocked)");
    await userEvent.click(grantButton);

    await waitFor(() => {
      expect(screen.getByText(/Allowance granted successfully!/i)).toBeInTheDocument();
    });
  });

  it("displays success notification after revoke", async () => {
    render(<AllowanceManager />);

    const revokeTab = screen.getByText("Revoke Allowance");
    await userEvent.click(revokeTab);

    const revokeButton = screen.getByText("Revoke (Mocked)");
    await userEvent.click(revokeButton);

    await waitFor(() => {
      expect(screen.getByText(/Allowance revoked successfully!/i)).toBeInTheDocument();
    });
  });

  it("displays success notification after transfer", async () => {
    render(<AllowanceManager />);

    const transferTab = screen.getByText("Transfer From");
    await userEvent.click(transferTab);

    const transferButton = screen.getByText("Transfer (Mocked)");
    await userEvent.click(transferButton);

    await waitFor(() => {
      expect(screen.getByText(/Transfer completed successfully!/i)).toBeInTheDocument();
    });
  });

  it("auto-dismisses notifications after 5 seconds", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(<AllowanceManager />);

    const grantButton = screen.getByText("Grant (Mocked)");
    await user.click(grantButton);

    await waitFor(() => {
      expect(screen.getByText(/Allowance granted successfully!/i)).toBeInTheDocument();
    });

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    await waitFor(() => {
      expect(screen.queryByText(/Allowance granted successfully!/i)).not.toBeInTheDocument();
    });

    jest.useRealTimers();
  });

  it("displays info section with instructions", () => {
    render(<AllowanceManager />);

    expect(screen.getByText("How allowances work:")).toBeInTheDocument();
    expect(screen.getByText(/Set the maximum amount a spender can transfer/i)).toBeInTheDocument();
    expect(screen.getByText(/Remove a spender's ability to transfer/i)).toBeInTheDocument();
    expect(screen.getByText(/Transfer tokens if you have an allowance/i)).toBeInTheDocument();
  });
});

describe("AllowancesPanel", () => {
  // Coverage moved here when AllowanceList, AllowancesList and the second
  // allowances route were consolidated into this one component.
  const columns = { spender: "Spender", amount: "Amount", status: "Status" };
  const mockAllowances = [
    {
      spenderAddress: "GCPFGJGZOXPF5EZBQ7TGVGVW4ZBDAJT3RDSAICABJ7GCM3QQHLJNZ7PZ",
      amount: "10000000000",
      amountFormatted: "1000.00",
      expirationLedger: 1000000,
      isExpired: false,
    },
    {
      spenderAddress: "GBJPHEJM3VE6D37MYVOKXCPY2TGFBQ6XTWZFSXFVEVT3ZCZZP2CAAAJX",
      amount: "5000000000",
      amountFormatted: "500.00",
      expirationLedger: 500000,
      isExpired: true,
    },
  ];

  const renderPanel = (props: Partial<React.ComponentProps<typeof AllowancesPanel>> = {}) =>
    render(
      <AllowancesPanel
        allowances={mockAllowances}
        columns={columns}
        emptyTitle="No allowances on this token"
        emptyDescription="Approve an account to see it here."
        {...props}
      />,
    );

  it("renders the empty state when there are no allowances", () => {
    renderPanel({ allowances: [] });
    expect(screen.getByText("No allowances on this token")).toBeInTheDocument();
  });

  it("renders the loading state", () => {
    renderPanel({ loading: true });
    expect(screen.getByText("Loading allowances…")).toBeInTheDocument();
  });

  it("surfaces a load failure with a way to retry", async () => {
    const onRetry = jest.fn();
    renderPanel({ error: "RPC unreachable", onRetry });
    expect(screen.getByText("RPC unreachable")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Try again"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("renders every allowance with its amount and status", () => {
    renderPanel();
    expect(screen.getByText("1000.00")).toBeInTheDocument();
    expect(screen.getByText("500.00")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("shows the expiration ledger", () => {
    renderPanel({ allowances: [mockAllowances[0]] });
    expect(screen.getByText("Ledger 1,000,000")).toBeInTheDocument();
  });

  it("offers revoke on live allowances only", () => {
    const onRevoke = jest.fn();
    renderPanel({ allowances: [mockAllowances[0]], onRevoke });
    expect(screen.getByText("Revoke")).toBeInTheDocument();

    renderPanel({ allowances: [mockAllowances[1]], onRevoke });
    // An expired allowance has nothing left to revoke.
    expect(screen.getAllByText("Revoke")).toHaveLength(1);
  });

  it("copies a spender address", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderPanel({ allowances: [mockAllowances[0]] });
    await userEvent.click(screen.getByLabelText("Copy spender address"));
    expect(writeText).toHaveBeenCalledWith(mockAllowances[0].spenderAddress);
  });
});

describe("AllowancesPanel — multiple allowances", () => {
  const columns = { spender: "Spender", amount: "Amount", status: "Status" };
  const mockAllowances = [
    {
      spenderAddress: "GCPFGJGZOXPF5EZBQ7TGVGVW4ZBDAJT3RDSAICABJ7GCM3QQHLJNZ7PZ",
      amount: "10000000000",
      amountFormatted: "1000.00",
      expirationLedger: 1000000,
      isExpired: false,
    },
    {
      spenderAddress: "GBJPHEJM3VE6D37MYVOKXCPY2TGFBQ6XTWZFSXFVEVT3ZCZZP2CAAAJX",
      amount: "5000000000",
      amountFormatted: "500.00",
      expirationLedger: 500000,
      isExpired: false,
    },
    {
      spenderAddress: "GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKB4YC5MZ3RECC5FQNPQFXBVK",
      amount: "1000000000",
      amountFormatted: "100.00",
      expirationLedger: 200000,
      isExpired: false,
    },
  ];

  it("renders every allowance", () => {
    render(
      <AllowancesPanel
        allowances={mockAllowances}
        columns={columns}
        emptyTitle="none"
        emptyDescription="none"
      />,
    );
    expect(screen.getAllByText(/^\d+\.\d{2}$/)).toHaveLength(3);
  });

  it("revokes the allowance whose row was clicked", async () => {
    const onRevoke = jest.fn();
    render(
      <AllowancesPanel
        allowances={mockAllowances}
        columns={columns}
        emptyTitle="none"
        emptyDescription="none"
        onRevoke={onRevoke}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: /^Revoke allowance for/i })[0]);

    // The spender address identifies the allowance on chain; a list index
    // would break the moment the list is filtered or reordered.
    expect(onRevoke).toHaveBeenCalledWith(mockAllowances[0].spenderAddress);
  });
});
