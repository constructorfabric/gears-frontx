import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  Field,
  FieldLabel,
  Input,
} from '@gears-frontx/ui-kit';
import type { ApiUser } from '../../../api/types';
import styles from '../ProfileScreen.module.css';

export type ProfileFormValues = {
  firstName: string;
  lastName: string;
  department: string;
};

interface ProfileDetailsCardProps {
  user: ApiUser;
  isSaving: boolean;
  saveErrorMessage?: string;
  t: (key: string) => string;
  onRefresh: () => void;
  onSubmit: (values: ProfileFormValues) => Promise<void>;
}

function getFormValues(user: ApiUser): ProfileFormValues {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    department:
      typeof user.extra?.department === 'string' ? user.extra.department : '',
  };
}

export const ProfileDetailsCard: React.FC<ProfileDetailsCardProps> = ({
  user,
  isSaving,
  saveErrorMessage,
  t,
  onRefresh,
  onSubmit,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formValues, setFormValues] = useState<ProfileFormValues>(() =>
    getFormValues(user)
  );

  useEffect(() => {
    if (!isEditing) {
      setFormValues(getFormValues(user));
    }
  }, [isEditing, user]);

  const initialValues = useMemo(() => getFormValues(user), [user]);
  const normalizedValues = useMemo(
    () => ({
      firstName: formValues.firstName.trim(),
      lastName: formValues.lastName.trim(),
      department: formValues.department.trim(),
    }),
    [formValues]
  );
  const isDirty =
    normalizedValues.firstName !== initialValues.firstName ||
    normalizedValues.lastName !== initialValues.lastName ||
    normalizedValues.department !== initialValues.department;
  const isFormValid =
    normalizedValues.firstName.length > 0 && normalizedValues.lastName.length > 0;

  const handleFieldChange =
    (field: keyof ProfileFormValues) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setFormValues((current) => ({
          ...current,
          [field]: event.target.value,
        }));
      };

  const handleCancel = () => {
    setFormValues(initialValues);
    setIsEditing(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isDirty || !isFormValid) {
      return;
    }

    try {
      await onSubmit(normalizedValues);
      setIsEditing(false);
    } catch {
      // Parent surfaces the error via saveErrorMessage; keep editing open.
    }
  };

  let body: React.ReactNode;
  if (isEditing) {
    body = (
      /*
       * The form sits inside CardContent rather than around the card's slots:
       * Card spaces its slots with `gap: var(--card-spacing)` on the card root,
       * so that rhythm only falls between Card's direct children. A wrapper
       * around them leaves the card a single child and the gap applies to
       * nothing, while the slots' horizontal padding still lands.
       */
      <form onSubmit={handleSubmit} className={styles.form}>
        {/*
          Field wires the label's `htmlFor`, the control's id and
          `aria-describedby` itself — the ids these three fields used to carry
          by hand would now compete with the ones it generates.
        */}
        <Field name="firstName" disabled={isSaving}>
          <FieldLabel>{t('first_name_label')}</FieldLabel>
          <Input value={formValues.firstName} onChange={handleFieldChange('firstName')} />
        </Field>

        <Field name="lastName" disabled={isSaving}>
          <FieldLabel>{t('last_name_label')}</FieldLabel>
          <Input value={formValues.lastName} onChange={handleFieldChange('lastName')} />
        </Field>

        <Field name="department" disabled={isSaving}>
          <FieldLabel>{t('department_label')}</FieldLabel>
          <Input value={formValues.department} onChange={handleFieldChange('department')} />
        </Field>

        {/*
          The save failure belongs to the request, not to any one control, so it
          stays outside the Fields rather than in a FieldError none of them owns.
        */}
        {saveErrorMessage ? <p className={styles.error}>{saveErrorMessage}</p> : null}

        <div className={styles.actions}>
          <Button type="submit" disabled={!isDirty || !isFormValid || isSaving}>
            {isSaving ? t('saving') : t('save')}
          </Button>
          <Button type="button" variant="outline" disabled={isSaving} onClick={handleCancel}>
            {t('cancel')}
          </Button>
        </div>
      </form>
    );
  } else {
    body = (
      <dl className={styles.definitions}>
        <div>
          <dt className={styles.term}>{t('role_label')}</dt>
          <dd>{user.role}</dd>
        </div>
        {user.extra?.department !== undefined && (
          <div>
            <dt className={styles.term}>{t('department_label')}</dt>
            <dd>{String(user.extra.department)}</dd>
          </div>
        )}
        <div>
          <dt className={styles.term}>{t('id_label')}</dt>
          <dd className={styles.value}>{user.id}</dd>
        </div>
        <div>
          <dt className={styles.term}>{t('created_label')}</dt>
          <dd>{new Date(user.createdAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt className={styles.term}>{t('last_updated_label')}</dt>
          <dd>{new Date(user.updatedAt).toLocaleString()}</dd>
        </div>
      </dl>
    );
  }

  return (
    <Card>
      <CardContent>
        <div className={styles.identity}>
          {user.avatarUrl && (
            <img
              src={user.avatarUrl}
              alt={`${user.firstName} ${user.lastName}`}
              className={styles.avatar}
            />
          )}
          <h2 className={styles.name}>
            {user.firstName} {user.lastName}
          </h2>
          <p className={styles.email}>{user.email}</p>
        </div>
      </CardContent>
      <CardContent>{body}</CardContent>
      <CardFooter>
        <div className={styles.actions}>
          <Button data-testid="profile-refresh-button" onClick={onRefresh} disabled={isSaving}>
            {t('refresh')}
          </Button>
          {isEditing ? null : (
            <Button variant="outline" disabled={isSaving} onClick={() => setIsEditing(true)}>
              {t('edit_profile')}
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
};

ProfileDetailsCard.displayName = 'ProfileDetailsCard';
