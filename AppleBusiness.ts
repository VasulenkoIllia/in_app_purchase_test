import moment from 'moment-timezone';


interface IPurchaseParsedResultFromProvider {
    originalTransactionId?: string;
    expiredAt?: Date;
    validated: boolean;
    trial: boolean;
    checked: boolean;
    sandBox: boolean;
    productType: string;
    lastResponseFromProvider?: string;
}
export enum ProductType {
    Subscription = 'Subscription',
    Consumable = 'Consumable',
    NonConsumable = 'NonConsumable'
}

export default class AppleBusiness {
    constructor(
        private _constants,
        private _handlerService,
    ) {

    }
    async verifyAndParseReceipt(productId: string, token: string, productType) {
        return await this._verifyAndParseReceipt(productId, token, productType, true);
        // try {
        //     return await this._verifyAndParseReceipt(productId, token, productType, false);
        // } catch (e) {
        //     if (e.type) {
        //         console.log(e.type)
        //         return await this._verifyAndParseReceipt(productId, token, productType, true);
        //     } else throw e;
        // }
    }


    private async _verifyReceipt(receiptValue: string, sandBox: boolean) {
        let options = {
            host: sandBox ? this._constants.apple.sandbox : this._constants.apple.host,
            path: this._constants.apple.path,
            method: 'POST'
        };
        let body = {
            'receipt-data': receiptValue,
            'password': this._constants.apple.password
        };
        let result = null;
        let stringResult = await this._handlerService.sendHttp(options, body, 'https');
        result = JSON.parse(stringResult);
        return result;
    }


    private _getTransactionIdFromAppleResponse(currentPurchaseFromApple: any) {
        return currentPurchaseFromApple.original_transaction_id;
    }


    private async _verifyAndParseReceipt(product: string, receiptValue: string, productType, sandBox: boolean) {
        let resultFromApple = await this._verifyReceipt(receiptValue, sandBox);
        // @ts-ignore
        if (!resultFromApple || !resultFromApple?.status === undefined) {

            console.log('ERROR', resultFromApple)
            return;
        }   return await this._parseResponse(product, resultFromApple, productType, sandBox);
    }

    private async _parseResponse(product: string, resultFromApple: any, productType, sandBox: boolean) {
        let parsedResult: Partial<IPurchaseParsedResultFromProvider> = {
            validated: false,
            trial: false,
            checked: false,
            sandBox,
            productType: productType,
            lastResponseFromProvider: JSON.stringify(resultFromApple)
        };

        switch (resultFromApple.status) {
            /**
             * Валидная подписка
             */
            case 0: {
                let currentPurchaseFromApple = this._getCurrentPurchaseFromAppleResult(resultFromApple, product!, productType);
                parsedResult.checked = true;
                if (!currentPurchaseFromApple) break;
                parsedResult.originalTransactionId = this._getTransactionIdFromAppleResponse(currentPurchaseFromApple);
                if (productType === ProductType.Subscription) {
                    parsedResult.validated = (this._checkDateIsAfter(currentPurchaseFromApple.expires_date_ms)) ? true : false;
                    parsedResult.expiredAt = (this._checkDateIsValid(currentPurchaseFromApple.expires_date_ms)) ?
                        this._formatDate(currentPurchaseFromApple.expires_date_ms) : undefined;
                } else {
                    parsedResult.validated = true;
                }
                parsedResult.trial = this._checkPurchaseIsTrial(currentPurchaseFromApple);
                break;
            }
            /**
             * Неправильный sharedKey
             */
            case 21004: {
                parsedResult.checked = true;
                parsedResult.validated = false;
                break;
            }
            /**
             * Подписка истекла
             */
            case 21006: {
                let currentPurchaseFromApple = this._getCurrentPurchaseFromAppleResult(resultFromApple, product!, productType);
                if (!currentPurchaseFromApple) break;
                parsedResult.originalTransactionId = this._getTransactionIdFromAppleResponse(currentPurchaseFromApple);
                parsedResult.checked = true;
                parsedResult.validated = false;
                parsedResult.expiredAt = moment(currentPurchaseFromApple.expires_date_ms, 'x').toDate();
                parsedResult.trial = this._checkPurchaseIsTrial(currentPurchaseFromApple);
                break;
            }
            /**
             * Подписка из сэндбокса
             */
            case 21007: {
                console.log('SANDBOX PURCHASE')
            }
            default:
                if (!resultFromApple) console.log('empty result from apple');
                else console.log('incorrect result from apple, status:', resultFromApple.status);
        }

        return parsedResult;
    }

    private _checkDateIsValid(dateFromApple?: string) {
        return (dateFromApple &&
            moment(dateFromApple, 'x').isValid());
    }

    private _checkDateIsAfter(dateFromApple?: string) {
        return (dateFromApple &&
            moment(dateFromApple, 'x').isValid() &&
            moment(dateFromApple, 'x').isAfter(moment()));
    }

    private _formatDate(dateFromApple: string) {
        return moment(dateFromApple, 'x').toDate();
    }

    private _checkPurchaseIsTrial(currentPurchaseFromApple: any) {
        return (currentPurchaseFromApple && currentPurchaseFromApple.is_trial_period === 'false') ? true : false;
    }

    private _getCurrentPurchaseFromAppleResult(resultFromApple: any, productIdToCheck: string, productType: string) {

        let findPurchase: any;
        let lastTimestamp: Date;
        const isSubscription = productType === ProductType.Subscription;
        const purchases: any[] = (isSubscription) ? resultFromApple.latest_receipt_info : resultFromApple.receipt.in_app;

        try {
            purchases.forEach((item: any) => {

                if (item.product_id !== productIdToCheck) return;

                let currentDate: Date;

                if (!isSubscription) {
                    findPurchase = item;
                    return;
                }

                currentDate = this._formatDate(item.expires_date_ms);

                if (moment(lastTimestamp).isBefore(currentDate!)) {
                    findPurchase = item
                    lastTimestamp = currentDate;
                }

            })
        } catch(e) {
            console.error(resultFromApple);
            throw e;
        }

        // TODO ??
        return findPurchase;
    }

}



