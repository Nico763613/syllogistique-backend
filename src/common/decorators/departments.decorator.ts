import { SetMetadata } from '@nestjs/common';
import { Department } from '../departments';

export const DEPARTMENTS_KEY = 'departments';
// Départements autorisés à MODIFIER les données de ce module (les GET restent ouverts)
export const Departments = (...departments: Department[]) => SetMetadata(DEPARTMENTS_KEY, departments);
