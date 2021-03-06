import { ProtocolService, getMainIdentifier } from '@airgap/angular-core'
import { Component } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { AirGapMarketWallet, ICoinProtocol, NetworkType, ProtocolSymbols } from '@airgap/coinlib-core'
import { map } from 'rxjs/operators'
import { DataService, DataServiceKey } from 'src/app/services/data/data.service'
import { PriceService } from 'src/app/services/price/price.service'

import { AccountProvider } from '../../services/account/account.provider'
import { ErrorCategory, handleErrorSentry } from '../../services/sentry-error-handler/sentry-error-handler'

@Component({
  selector: 'page-sub-account-import',
  templateUrl: 'sub-account-import.html'
})
export class SubAccountImportPage {
  private readonly subProtocolIdentifier: ProtocolSymbols
  private readonly networkIdentifier: string

  public subProtocol: ICoinProtocol
  public subWallets: AirGapMarketWallet[]

  public typeLabel: string = ''

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly accountProvider: AccountProvider,
    private readonly priceService: PriceService,
    private readonly protocolService: ProtocolService,
    dataService: DataService
  ) {
    this.subWallets = []
    let info: any

    info = dataService.getData(DataServiceKey.PROTOCOL)

    if (info !== undefined) {
      this.subProtocolIdentifier = info.subProtocolIdentifier
      this.networkIdentifier = info.networkIdentifier
      this.protocolService.getProtocol(this.subProtocolIdentifier, this.networkIdentifier).then((protocol: ICoinProtocol) => {
        this.subProtocol = protocol
      })
    } else {
      this.subProtocolIdentifier = this.route.snapshot.params.protocolID
      this.networkIdentifier = this.route.snapshot.params.networkID

      this.protocolService.getProtocol(this.subProtocolIdentifier, this.networkIdentifier).then((protocol: ICoinProtocol) => {
        this.subProtocol = protocol
      })
    }

    this.accountProvider.wallets
      .pipe(
        map(mainAccounts =>
          mainAccounts.filter(
            wallet =>
              wallet.protocol.identifier === getMainIdentifier(this.subProtocolIdentifier) &&
              wallet.protocol.options.network.type === NetworkType.MAINNET
          )
        )
      )
      .subscribe(mainAccounts => {
        const promises: Promise<void>[] = mainAccounts.map(async mainAccount => {
          if (!this.accountProvider.walletByPublicKeyAndProtocolAndAddressIndex(mainAccount.publicKey, this.subProtocolIdentifier)) {
            const protocol = await this.protocolService.getProtocol(this.subProtocolIdentifier)
            const airGapMarketWallet: AirGapMarketWallet = new AirGapMarketWallet(
              protocol,
              mainAccount.publicKey,
              mainAccount.isExtendedPublicKey,
              mainAccount.derivationPath,
              this.priceService
            )
            airGapMarketWallet.addresses = mainAccount.addresses
            this.subWallets.push(airGapMarketWallet)

            return airGapMarketWallet.synchronize()
          }
        })

        Promise.all(promises)
          .then(() => this.accountProvider.triggerWalletChanged())
          .catch(handleErrorSentry(ErrorCategory.COINLIB))
      })
  }

  public importWallets() {
    this.subWallets.forEach(subWallet => {
      this.accountProvider.addWallet(subWallet).catch(handleErrorSentry(ErrorCategory.WALLET_PROVIDER))
    })
    this.popToRoot()
  }

  public importWallet(subWallet: AirGapMarketWallet) {
    this.accountProvider.addWallet(subWallet).catch(handleErrorSentry(ErrorCategory.WALLET_PROVIDER))
    this.popToRoot()
  }

  public popToRoot() {
    this.router.navigateByUrl('/tabs/portfolio').catch(handleErrorSentry(ErrorCategory.NAVIGATION))
  }
}
