import { UserDataFunctions } from '@microsoft/fabric-user-data-functions';

const udf = new UserDataFunctions();

udf.func(
  'helloWorld',
  (firstName: string, lastName: string): string =>
    `Hello ${firstName} ${lastName}!`,
  []
);
