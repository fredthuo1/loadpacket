import { Matches } from 'class-validator';
export class SetAmountDto {
  @Matches(/^\d{1,10}(\.\d{1,2})?$/, {
    message: 'amount must be a monetary string with up to two decimal places',
  })
  amount!: string;
}
