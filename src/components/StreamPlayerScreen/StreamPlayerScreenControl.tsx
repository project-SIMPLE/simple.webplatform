import Header from '../Header/Header';

const StreamPlayerScreenControl = () => {
    return (
        <div className='h-full flex flex-col'>
            <Header needsMiniNav />
            <div className='flex flex-col items-center justify-center h-full'>
                <div className='w-5/6 h-5/6 rounded-md items-center justify-center' style={{ backgroundColor: '#a1d2ff' }}>
                    <h1 className='text-center'>Controls screen placeholder</h1>
                </div>
            </div>
        </div>
    );
};

export default StreamPlayerScreenControl;