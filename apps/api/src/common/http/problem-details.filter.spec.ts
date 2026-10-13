import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProblemDetailsFilter } from './problem-details.filter';
import { ProblemException } from './problem.exception';

describe('ProblemDetailsFilter', () => {
  const filter = new ProblemDetailsFilter();

  it('maps Nest HTTP exceptions to a problem with the standard title', () => {
    expect(filter.toProblem(new NotFoundException('Customer not found'))).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'Customer not found',
    });
  });

  it('uses the default message when none is given', () => {
    expect(filter.toProblem(new ForbiddenException())).toMatchObject({
      status: 403,
      detail: 'Forbidden',
    });
  });

  it('passes ProblemException bodies through unchanged', () => {
    const exception = ProblemException.validation([{ path: 'email', message: 'Invalid email' }]);
    expect(filter.toProblem(exception)).toEqual(exception.problem);
  });

  it('hides the details of unexpected errors', () => {
    const problem = filter.toProblem(new Error('connection string postgres://secret'));
    expect(problem).toEqual({ type: 'about:blank', title: 'Internal Server Error', status: 500 });
  });

  it('writes application/problem+json with the request path as instance', () => {
    const json = jest.fn();
    const type = jest.fn(() => ({ json }));
    const status = jest.fn(() => ({ type }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ originalUrl: '/api/v1/missing' }),
        getResponse: () => ({ status }),
      }),
    };

    filter.catch(new NotFoundException(), host as never);

    expect(status).toHaveBeenCalledWith(404);
    expect(type).toHaveBeenCalledWith('application/problem+json');
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ instance: '/api/v1/missing' }));
  });
});
