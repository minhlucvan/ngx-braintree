import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { NgxBraintreeService } from './ngx-braintree.service';
import { ConfigureDropinService } from './configure-dropin.service';
declare var braintree: any;

@Component({
  selector: 'ngx-braintree',
  template: `
    <div class="error" *ngIf="errorMessage">Error! {{errorMessage}}</div>
    <div *ngIf="showDropinUI && clientToken" ngxBraintreeDirective>
      <div id="dropin-container"></div>
      <button *ngIf="showPayButton" (click)="pay()">{{buttonText}}</button>
    </div>
    <div *ngIf="clientTokenNotReceived">
      <div class="error">Error! Client token not received.</div>
      Make sure your clientTokenURL's JSON response is as shown below:
      <pre>{{ '{' }}"token":"braintree_client_token_generated_on_your_server"{{'}'}}</pre>
    </div>`,
  styles: [`
    button {
      background-color: #009CDE;
      color: #f9f9f9;
      border: none;
      border-radius: 4px;
      height: 40px;
      line-height: 40px;
      font-size: 16px;
      cursor: pointer; }
    .error{
			color: #ffffff;
      background-color: red;
      font-weight: bolder;
      border: none;
      border-radius: 4px;
      height: 30px;
      line-height: 30px;
		}`]
})
export class NgxBraintreeComponent implements OnInit {

  @Input() clientTokenURL: string;
  @Input() createPurchaseURL: string;
  @Input() chargeAmount: number;
  @Output() paymentStatus: EventEmitter<any> = new EventEmitter<any>();
  clientToken: string;
  nonce: string;
  showDropinUI = true;
  errorMessage: string;

  showPayButton = false; // to display the pay button only after the dropin UI has rendered.
  clientTokenNotReceived = false; // to show the error, "Error! Client token not received."
  interval: any;
  instance: any;
  dropinConfig: any = {};

  // Optional inputs
  @Input() buttonText = 'Buy'; // to configure the pay button text
  @Input() allowChoose = false;
  @Input() showCardholderName = false;
  @Input() enablePaypalCheckout = false;
  @Input() enablePaypalVault = false;
  @Input() currency: string;

  constructor(
    private service: NgxBraintreeService,
    private configureDropinService: ConfigureDropinService) { }

  ngOnInit() {
    if (this.enablePaypalCheckout && this.enablePaypalVault) {
      this.errorMessage = "Please make sure either Paypal Checkout or Paypal Vault is set to true. Both cannot be true at the same time.";
    } else if (this.enablePaypalCheckout && !this.currency) { //user should provide currency for paypal checkout.
      this.errorMessage = "Please provide the currency input for Paypal Checkout. ex: [currency]=\"'USD'\"";
    } else {
      this.generateDropInUI();
    }
  }

  generateDropInUI() {
    this.service
      .getClientToken(this.clientTokenURL)
      .subscribe((clientToken: string) => {
        if (!clientToken) {
          this.clientTokenNotReceived = true;
        } else {
          this.clientToken = clientToken;
          this.clientTokenNotReceived = false;
          this.interval = setInterval(() => { this.createDropin(); }, 0);
        }
      }, (error) => {
        this.clientTokenNotReceived = true;
        console.error(`Client token not received.
        Please make sure your braintree server api is configured properly, running and accessible.`);
      });
  }

  createDropin() {
    if (typeof braintree !== 'undefined') {
      this.dropinConfig.authorization = this.clientToken;
      this.dropinConfig.container = '#dropin-container';
      if (this.showCardholderName) {
        this.configureDropinService.configureCardHolderName(this.dropinConfig);
      }
      if (this.enablePaypalCheckout) {
        this.configureDropinService.configurePaypalCheckout(this.dropinConfig, this.chargeAmount, this.currency);
      }
      if (this.enablePaypalVault) {
        this.configureDropinService.configurePaypalVault(this.dropinConfig);
      }

      braintree.dropin.create(this.dropinConfig, (createErr, instance) => {
        if (createErr) {
          console.error(createErr);
          this.errorMessage = createErr;
          return;
        }
        this.instance = instance;
        this.showPayButton = true;        
      });
      clearInterval(this.interval);
    }
  }

  pay(): void {
    if (this.instance) {
      this.instance.requestPaymentMethod((err, payload) => {
        if (err) {
          console.error(err);
          this.errorMessage = err;
          return;
        } else {
          this.errorMessage = null;
        }
        if (!this.allowChoose) { // process immediately after tokenization
          this.nonce = payload.nonce;
          this.showDropinUI = false;
          this.confirmPay();
        } else { // dont process immediately. Give user a chance to change his payment details.
          if (!this.nonce) { // previous nonce doesn't exist
            this.nonce = payload.nonce;
            if (payload.details && payload.type === 'PayPalAccount') {
              this.confirmPay();
            }
          } else { // a nonce exists already
            if (this.nonce === payload.nonce) { // go ahead with payment
              this.confirmPay();
            } else {
              this.nonce = payload.nonce;
            }
          }
        }
      });
    }
  }

  confirmPay(): void {
    this.showDropinUI = false;
    this.service
      .createPurchase(this.createPurchaseURL, this.nonce, this.chargeAmount)
      .subscribe((status: any) => {
        if (status.errors) {
          this.errorMessage = status.message;
          this.showDropinUI = true;
          this.generateDropInUI();
        }
        this.paymentStatus.emit(status);
      });
  }
}
