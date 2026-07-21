import { useParams } from 'react-router-dom';
import { ProfileView } from './Profile';

export default function PublicProfile() {
    const { id } = useParams();
    return <ProfileView endpoint={`/users/${id}/profile`} editable={false} />;
}
