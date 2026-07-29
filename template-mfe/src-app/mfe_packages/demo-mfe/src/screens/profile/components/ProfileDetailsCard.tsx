import React, { useEffect, useMemo, useState } from 'react';
import { trim } from 'lodash';
import type { ApiUser } from '../../../api/types';
import { Card, CardContent, CardFooter } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { ButtonVariant } from '../../../components/types';

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
      firstName: trim(formValues.firstName),
      lastName: trim(formValues.lastName),
      department: trim(formValues.department),
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

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-6">
          {user.avatarUrl && (
            <img
              src={user.avatarUrl}
              alt={`${user.firstName} ${user.lastName}`}
              className="w-20 h-20 rounded-full"
            />
          )}
        </div>

        <div className="mb-6">
          <h2 className="text-2xl font-semibold mb-2">
            {user.firstName} {user.lastName}
          </h2>
          <p className="text-foreground font-mono text-sm">{user.email}</p>
        </div>

        {isEditing ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="profile-first-name">{t('first_name_label')}</Label>
              <Input
                id="profile-first-name"
                value={formValues.firstName}
                onChange={handleFieldChange('firstName')}
                disabled={isSaving}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="profile-last-name">{t('last_name_label')}</Label>
              <Input
                id="profile-last-name"
                value={formValues.lastName}
                onChange={handleFieldChange('lastName')}
                disabled={isSaving}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="profile-department">{t('department_label')}</Label>
              <Input
                id="profile-department"
                value={formValues.department}
                onChange={handleFieldChange('department')}
                disabled={isSaving}
              />
            </div>

            {saveErrorMessage ? (
              <p className="text-sm text-destructive">{saveErrorMessage}</p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!isDirty || !isFormValid || isSaving}>
                {isSaving ? t('saving') : t('save')}
              </Button>
              <Button
                type="button"
                variant={ButtonVariant.Outline}
                disabled={isSaving}
                onClick={handleCancel}
              >
                {t('cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <dl className="grid gap-3">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t('role_label')}
              </dt>
              <dd className="text-foreground">{user.role}</dd>
            </div>
            {user.extra?.department !== undefined && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  {t('department_label')}
                </dt>
                <dd className="text-foreground">{String(user.extra.department)}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t('id_label')}
              </dt>
              <dd className="text-foreground font-mono text-sm">{user.id}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t('created_label')}
              </dt>
              <dd className="text-foreground text-sm">
                {new Date(user.createdAt).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t('last_updated_label')}
              </dt>
              <dd className="text-foreground text-sm">
                {new Date(user.updatedAt).toLocaleString()}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
      <CardFooter className="p-6 pt-0 gap-2">
        <Button data-testid="profile-refresh-button" onClick={onRefresh} disabled={isSaving}>
          {t('refresh')}
        </Button>
        {isEditing ? null : (
          <Button
            variant={ButtonVariant.Outline}
            disabled={isSaving}
            onClick={() => setIsEditing(true)}
          >
            {t('edit_profile')}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

ProfileDetailsCard.displayName = 'ProfileDetailsCard';
