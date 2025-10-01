import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

export interface QuickbooksCredentials extends APICredentials {
  realmId?: string;
  minorVersion?: number;
}

interface QuickbooksBaseParams {
  companyId?: string;
}

interface QuickbooksCustomerParams extends QuickbooksBaseParams {
  name?: string;
  companyName?: string;
  primaryEmailAddr?: { address?: string };
  primaryPhone?: { freeFormNumber?: string };
  billAddr?: QuickbooksAddress;
  shipAddr?: QuickbooksAddress;
  notes?: string;
  taxable?: boolean;
  currencyRef?: QuickbooksReference;
  paymentMethodRef?: QuickbooksReference;
  salesTermRef?: QuickbooksReference;
}

interface QuickbooksUpdateCustomerParams extends QuickbooksCustomerParams {
  customerId: string;
  syncToken: string;
}

interface QuickbooksQueryParams extends QuickbooksBaseParams {
  query?: string;
  maxResults?: number;
  startPosition?: number;
}

interface QuickbooksItemParams extends QuickbooksBaseParams {
  name: string;
  description?: string;
  type: 'Inventory' | 'NonInventory' | 'Service';
  trackQtyOnHand?: boolean;
  unitPrice?: number;
  incomeAccountRef?: QuickbooksReference;
  expenseAccountRef?: QuickbooksReference;
  assetAccountRef?: QuickbooksReference;
  taxable?: boolean;
  salesTaxCodeRef?: QuickbooksReference;
  purchaseTaxCodeRef?: QuickbooksReference;
}

interface QuickbooksInvoiceParams extends QuickbooksBaseParams {
  customerRef: QuickbooksReference;
  txnDate?: string;
  dueDate?: string;
  line: QuickbooksInvoiceLine[];
  billAddr?: QuickbooksAddress;
  shipAddr?: QuickbooksAddress;
  emailStatus?: 'NotSet' | 'NeedToSend' | 'EmailSent';
  billEmail?: { address?: string };
  salesTermRef?: QuickbooksReference;
  customerMemo?: { value?: string };
  privateNote?: string;
}

interface QuickbooksSendInvoiceParams extends QuickbooksBaseParams {
  invoiceId: string;
  requestId?: string;
}

interface QuickbooksPaymentParams extends QuickbooksBaseParams {
  customerRef: QuickbooksReference;
  totalAmt: number;
  txnDate?: string;
  paymentMethodRef?: QuickbooksReference;
  depositToAccountRef?: QuickbooksReference;
  line?: QuickbooksPaymentLine[];
  privateNote?: string;
}

interface QuickbooksAccountsParams extends QuickbooksBaseParams {
  query?: string;
  maxResults?: number;
}

interface QuickbooksExpenseParams extends QuickbooksBaseParams {
  accountRef: QuickbooksReference;
  paymentType: 'Cash' | 'Check' | 'CreditCard';
  totalAmt: number;
  txnDate?: string;
  entityRef?: QuickbooksEntityReference;
  line?: QuickbooksExpenseLine[];
  privateNote?: string;
}

interface QuickbooksReportParams extends QuickbooksBaseParams {
  reportType: 'ProfitAndLoss' | 'BalanceSheet' | 'CashFlow' | 'TrialBalance' | 'GeneralLedger' | 'CustomerSales' | 'VendorExpenses';
  start_date?: string;
  end_date?: string;
  accounting_method?: 'Cash' | 'Accrual';
  summarize_column_by?: 'Month' | 'Quarter' | 'Year';
}

interface QuickbooksInvoiceLine {
  amount: number;
  detailType: 'SalesItemLineDetail';
  description?: string;
  salesItemLineDetail?: {
    itemRef?: QuickbooksReference;
    qty?: number;
    unitPrice?: number;
    taxCodeRef?: QuickbooksReference;
  };
}

interface QuickbooksPaymentLine {
  amount?: number;
  linkedTxn?: { txnId?: string; txnType?: string }[];
}

interface QuickbooksExpenseLine {
  amount?: number;
  detailType?: string;
  accountBasedExpenseLineDetail?: {
    accountRef?: QuickbooksReference;
    customerRef?: QuickbooksReference;
    billableStatus?: string;
    taxCodeRef?: QuickbooksReference;
  };
}

interface QuickbooksAddress {
  line1?: string;
  line2?: string;
  city?: string;
  countrySubDivisionCode?: string;
  postalCode?: string;
  country?: string;
}

interface QuickbooksReference {
  value?: string;
  name?: string;
}

interface QuickbooksEntityReference extends QuickbooksReference {
  type?: string;
}

const DEFAULT_MINOR_VERSION = 65;

/**
 * Minimal QuickBooks Online API client that wires the cataloged automation actions
 * to real REST endpoints. The implementation maps the strongly typed connector
 * parameters into QuickBooks payloads so workflows can execute without falling
 * back to placeholder routes.
 */
export class QuickbooksAPIClient extends BaseAPIClient {
  constructor(credentials: QuickbooksCredentials) {
    const realmId = credentials.realmId;
    super('https://sandbox-quickbooks.api.intuit.com/v3/company', credentials);

    this.registerHandlers({
      test_connection: () => this.testConnection(),
      get_company_info: params => this.getCompanyInfo(params),
      create_customer: params => this.createCustomer(params as QuickbooksCustomerParams),
      get_customer: params => this.getCustomer(params as { companyId?: string; customerId: string }),
      update_customer: params => this.updateCustomer(params as QuickbooksUpdateCustomerParams),
      query_customers: params => this.queryCustomers(params as QuickbooksQueryParams),
      create_item: params => this.createItem(params as QuickbooksItemParams),
      create_invoice: params => this.createInvoice(params as QuickbooksInvoiceParams),
      get_invoice: params => this.getInvoice(params as { companyId?: string; invoiceId: string }),
      send_invoice: params => this.sendInvoice(params as QuickbooksSendInvoiceParams),
      create_payment: params => this.createPayment(params as QuickbooksPaymentParams),
      get_accounts: params => this.getAccounts(params as QuickbooksAccountsParams),
      create_expense: params => this.createExpense(params as QuickbooksExpenseParams),
      get_reports: params => this.getReports(params as QuickbooksReportParams)
    });

    if (!credentials.accessToken) {
      throw new Error('QuickBooks integration requires an access token');
    }

    if (!realmId) {
      console.warn('⚠️ QuickBooks client initialized without a realmId. Action params must include companyId.');
    }
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    try {
      const companyId = this.resolveCompanyId();
      return await this.get(`/${companyId}/companyinfo/${companyId}${this.versionSuffix()}`);
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  public async getCompanyInfo(params: QuickbooksBaseParams): Promise<APIResponse<any>> {
    const companyId = this.resolveCompanyId(params);
    return this.get(`/${companyId}/companyinfo/${companyId}${this.versionSuffix()}`);
  }

  public async createCustomer(params: QuickbooksCustomerParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['name']);
    const companyId = this.resolveCompanyId(params);
    const payload = this.clean({
      DisplayName: params.name,
      CompanyName: params.companyName,
      PrimaryEmailAddr: this.clean(params.primaryEmailAddr),
      PrimaryPhone: params.primaryPhone?.freeFormNumber
        ? { FreeFormNumber: params.primaryPhone.freeFormNumber }
        : undefined,
      BillAddr: this.mapAddress(params.billAddr),
      ShipAddr: this.mapAddress(params.shipAddr),
      Notes: params.notes,
      Taxable: params.taxable,
      CurrencyRef: this.clean(params.currencyRef),
      PaymentMethodRef: this.clean(params.paymentMethodRef),
      SalesTermRef: this.clean(params.salesTermRef)
    });
    return this.post(`/${companyId}/customer${this.versionSuffix()}`, payload);
  }

  public async getCustomer(params: { companyId?: string; customerId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['customerId']);
    const companyId = this.resolveCompanyId(params);
    return this.get(`/${companyId}/customer/${params.customerId}${this.versionSuffix()}`);
  }

  public async updateCustomer(params: QuickbooksUpdateCustomerParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['customerId', 'syncToken']);
    const companyId = this.resolveCompanyId(params);
    const payload = this.clean({
      Id: params.customerId,
      SyncToken: params.syncToken,
      sparse: true,
      DisplayName: params.name,
      CompanyName: params.companyName,
      PrimaryEmailAddr: this.clean(params.primaryEmailAddr),
      PrimaryPhone: params.primaryPhone?.freeFormNumber
        ? { FreeFormNumber: params.primaryPhone.freeFormNumber }
        : undefined,
      BillAddr: this.mapAddress(params.billAddr),
      Notes: params.notes
    });
    return this.post(`/${companyId}/customer${this.versionSuffix()}`, payload);
  }

  public async queryCustomers(params: QuickbooksQueryParams): Promise<APIResponse<any>> {
    const companyId = this.resolveCompanyId(params);
    const maxResults = params.maxResults ?? 20;
    const startPosition = params.startPosition ?? 1;
    let query = params.query?.trim() || 'SELECT * FROM Customer';
    if (!/STARTPOSITION/i.test(query)) {
      query = `${query} STARTPOSITION ${startPosition}`;
    }
    if (!/MAXRESULTS/i.test(query)) {
      query = `${query} MAXRESULTS ${maxResults}`;
    }
    return this.post(`/${companyId}/query${this.versionSuffix()}`, { query });
  }

  public async createItem(params: QuickbooksItemParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['name', 'type']);
    const companyId = this.resolveCompanyId(params);
    const payload = this.clean({
      Name: params.name,
      Description: params.description,
      Type: params.type,
      TrackQtyOnHand: params.trackQtyOnHand,
      UnitPrice: params.unitPrice,
      IncomeAccountRef: this.clean(params.incomeAccountRef),
      ExpenseAccountRef: this.clean(params.expenseAccountRef),
      AssetAccountRef: this.clean(params.assetAccountRef),
      Taxable: params.taxable,
      SalesTaxCodeRef: this.clean(params.salesTaxCodeRef),
      PurchaseTaxCodeRef: this.clean(params.purchaseTaxCodeRef)
    });
    return this.post(`/${companyId}/item${this.versionSuffix()}`, payload);
  }

  public async createInvoice(params: QuickbooksInvoiceParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['customerRef', 'line']);
    if (!Array.isArray(params.line) || params.line.length === 0) {
      throw new Error('QuickBooks invoices require at least one line item.');
    }
    const companyId = this.resolveCompanyId(params);
    const linePayloads = (params.line ?? [])
      .map(line =>
        this.clean({
          Amount: line.amount,
          DetailType: line.detailType,
          Description: line.description,
          SalesItemLineDetail: this.clean({
            ItemRef: this.clean(line.salesItemLineDetail?.itemRef),
            Qty: line.salesItemLineDetail?.qty,
            UnitPrice: line.salesItemLineDetail?.unitPrice,
            TaxCodeRef: this.clean(line.salesItemLineDetail?.taxCodeRef)
          })
        })
      )
      .filter(Boolean) as Record<string, any>[];

    const payload = this.clean({
      CustomerRef: this.clean(params.customerRef),
      TxnDate: params.txnDate,
      DueDate: params.dueDate,
      Line: linePayloads.length ? linePayloads : undefined,
      BillAddr: this.mapAddress(params.billAddr),
      ShipAddr: this.mapAddress(params.shipAddr),
      EmailStatus: params.emailStatus,
      BillEmail: this.clean(params.billEmail),
      SalesTermRef: this.clean(params.salesTermRef),
      CustomerMemo: this.clean(params.customerMemo),
      PrivateNote: params.privateNote
    });
    return this.post(`/${companyId}/invoice${this.versionSuffix()}`, payload);
  }

  public async getInvoice(params: { companyId?: string; invoiceId: string }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['invoiceId']);
    const companyId = this.resolveCompanyId(params);
    return this.get(`/${companyId}/invoice/${params.invoiceId}${this.versionSuffix()}`);
  }

  public async sendInvoice(params: QuickbooksSendInvoiceParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['invoiceId']);
    const companyId = this.resolveCompanyId(params);
    const headers: Record<string, string> = {};
    if (params.requestId) {
      headers['Request-Id'] = params.requestId;
    }
    return this.post(`/${companyId}/invoice/${params.invoiceId}/send${this.versionSuffix()}`, undefined, headers);
  }

  public async createPayment(params: QuickbooksPaymentParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['customerRef', 'totalAmt']);
    const companyId = this.resolveCompanyId(params);
    const paymentLines = (params.line ?? [])
      .map(line => this.clean({ Amount: line.amount, LinkedTxn: line.linkedTxn }))
      .filter(Boolean) as Record<string, any>[];

    const payload = this.clean({
      CustomerRef: this.clean(params.customerRef),
      TotalAmt: params.totalAmt,
      TxnDate: params.txnDate,
      PaymentMethodRef: this.clean(params.paymentMethodRef),
      DepositToAccountRef: this.clean(params.depositToAccountRef),
      Line: paymentLines.length ? paymentLines : undefined,
      PrivateNote: params.privateNote
    });
    return this.post(`/${companyId}/payment${this.versionSuffix()}`, payload);
  }

  public async getAccounts(params: QuickbooksAccountsParams): Promise<APIResponse<any>> {
    const companyId = this.resolveCompanyId(params);
    const maxResults = params.maxResults ?? 20;
    const query = params.query?.trim() || 'SELECT * FROM Account';
    const finalQuery = /MAXRESULTS/i.test(query)
      ? query
      : `${query} MAXRESULTS ${maxResults}`;
    return this.post(`/${companyId}/query${this.versionSuffix()}`, { query: finalQuery });
  }

  public async createExpense(params: QuickbooksExpenseParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['accountRef', 'paymentType', 'totalAmt']);
    const companyId = this.resolveCompanyId(params);
    const expenseLines = (params.line ?? [])
      .map(line =>
        this.clean({
          Amount: line.amount,
          DetailType: line.detailType,
          AccountBasedExpenseLineDetail: this.clean({
            AccountRef: this.clean(line.accountBasedExpenseLineDetail?.accountRef),
            CustomerRef: this.clean(line.accountBasedExpenseLineDetail?.customerRef),
            BillableStatus: line.accountBasedExpenseLineDetail?.billableStatus,
            TaxCodeRef: this.clean(line.accountBasedExpenseLineDetail?.taxCodeRef)
          })
        })
      )
      .filter(Boolean) as Record<string, any>[];

    const payload = this.clean({
      AccountRef: this.clean(params.accountRef),
      PaymentType: params.paymentType,
      TotalAmt: params.totalAmt,
      TxnDate: params.txnDate,
      EntityRef: this.clean(params.entityRef),
      Line: expenseLines.length ? expenseLines : undefined,
      PrivateNote: params.privateNote
    });
    return this.post(`/${companyId}/purchase${this.versionSuffix()}`, payload);
  }

  public async getReports(params: QuickbooksReportParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params as any, ['reportType']);
    const companyId = this.resolveCompanyId(params);
    const queryParams = this.clean({
      start_date: params.start_date,
      end_date: params.end_date,
      accounting_method: params.accounting_method,
      summarize_column_by: params.summarize_column_by
    }) ?? {};
    const queryString = this.buildQueryString(queryParams);
    const minorSuffix = this.versionSuffix();
    const additional = queryString ? `&${queryString.slice(1)}` : '';
    return this.get(`/${companyId}/reports/${params.reportType}${minorSuffix}${additional}`);
  }

  private resolveCompanyId(params?: QuickbooksBaseParams): string {
    const companyId = params?.companyId || (this.credentials as QuickbooksCredentials).realmId;
    if (!companyId) {
      throw new Error('QuickBooks operations require a companyId parameter or realmId credential.');
    }
    return companyId;
  }

  private mapAddress(address?: QuickbooksAddress) {
    if (!address) return undefined;
    return this.clean({
      Line1: address.line1,
      Line2: address.line2,
      City: address.city,
      CountrySubDivisionCode: address.countrySubDivisionCode,
      PostalCode: address.postalCode,
      Country: address.country
    });
  }

  private clean<T extends Record<string, any> | undefined>(value: T): T | undefined {
    if (!value) {
      return value;
    }
    const entries = Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== '');
    if (entries.length === 0) {
      return undefined;
    }
    return Object.fromEntries(entries) as T;
  }

  private versionSuffix(): string {
    const minor = (this.credentials as QuickbooksCredentials).minorVersion ?? DEFAULT_MINOR_VERSION;
    return `?minorversion=${minor}`;
  }
}
